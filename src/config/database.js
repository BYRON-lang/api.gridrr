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