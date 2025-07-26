const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'gridrr_db',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Create tables if they don't exist
const createTables = async () => {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        accepted_terms BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create refresh_tokens table for token rotation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create employees table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin','moderator','support','designer','engineer','hr','marketing','sales','legal','finance','it','product','qa','operations','intern','custom')),
        department VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        can_chat BOOLEAN DEFAULT true,
        avatar_url TEXT,
        last_active TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create admin_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        last_login TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on admin_users email
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (email)
    `);

    // Insert default admin user if not exists
    await pool.query(`
      INSERT INTO admin_users (email, password_hash, name, role)
      VALUES (
        'admin@gridrr.com', 
        '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Password: Admin123
        'Admin User', 
        'superadmin'
      )
      ON CONFLICT (email) DO NOTHING
    `);

    // Create profiles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        display_name VARCHAR(100),
        profile_type VARCHAR(20),
        website VARCHAR(255),
        contact_email VARCHAR(255),
        bio TEXT,
        expertise TEXT,
        avatar_url VARCHAR(255),
        twitter VARCHAR(100),
        instagram VARCHAR(100),
        linkedin VARCHAR(255),
        facebook VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create posts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        tags TEXT,
        image_urls TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add indexes for performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)');
    // If tags is stored as JSON or array, use GIN index. If TEXT, skip or convert to JSONB for better search.
    // await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING gin(tags jsonb_path_ops)');

    // Create post_likes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
      )
    `);

    // Handle post_views table migration
    await migratePostViewsTable();

    // Create user_follows table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);

    // Create comments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure 'app' column exists in analytics table
    const analyticsTableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'analytics'
      )
    `);
    if (analyticsTableExists.rows[0].exists) {
      const appColumnExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'analytics' 
          AND column_name = 'app'
        )
      `);
      if (!appColumnExists.rows[0].exists) {
        console.log("Migrating analytics table to include 'app' column...");
        await pool.query(`ALTER TABLE analytics ADD COLUMN app VARCHAR(50) DEFAULT 'gridrr'`);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_app ON analytics (app)');
        console.log("Analytics table migration completed");
      }
      // Ensure 'deviceType' column exists in analytics table
      const deviceTypeColumnExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'analytics' 
          AND column_name = 'deviceType'
        )
      `);
      if (!deviceTypeColumnExists.rows[0].exists) {
        console.log("Migrating analytics table to include 'deviceType' column...");
        try {
          await pool.query(`ALTER TABLE analytics ADD COLUMN deviceType VARCHAR(20) DEFAULT 'desktop'`);
        } catch (err) {
          if (err.code !== '42701') throw err; // 42701 = duplicate_column
          console.log("deviceType column already exists, skipping migration.");
        }
        await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_deviceType ON analytics (deviceType)');
        console.log("Analytics table migration for deviceType completed");
      }
    }
    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
};

// Migration function for post_views table
const migratePostViewsTable = async () => {
  try {
    // Check if post_views table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'post_views'
      )
    `);

    if (tableExists.rows[0].exists) {
      // Check if user_id column exists
      const columnExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'post_views' 
          AND column_name = 'user_id'
        )
      `);

      if (!columnExists.rows[0].exists) {
        console.log('Migrating post_views table to include user_id...');
        
        // Add user_id column
        await pool.query('ALTER TABLE post_views ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
        
        // Add unique constraint
        await pool.query('ALTER TABLE post_views ADD CONSTRAINT post_views_unique UNIQUE(post_id, user_id)');
        
        // Set user_id to NULL for existing records (anonymous views)
        await pool.query('UPDATE post_views SET user_id = NULL WHERE user_id IS NULL');
        
        console.log('post_views table migration completed');
      }
    } else {
      // Create new post_views table with user_id
      await pool.query(`
        CREATE TABLE post_views (
          id SERIAL PRIMARY KEY,
          post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(post_id, user_id)
        )
      `);
    }
  } catch (error) {
    console.error('Error migrating post_views table:', error);
    throw error;
  }
};

// Initialize database
const initializeDatabase = async () => {
  try {
    await createTables();
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
};

module.exports = { pool, initializeDatabase }; 