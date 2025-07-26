const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'gridrr',
  password: 'Kingbronx22$',
  port: 5432,
});

async function updateAdminPassword() {
  try {
    // Generate hash for 'Admin123'
    const password = 'Admin123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('Generated hash for Admin123:', hashedPassword);
    
    // Update the admin password
    const result = await pool.query(
      'UPDATE admin_users SET password_hash = $1 WHERE email = $2 RETURNING email, name, role',
      [hashedPassword, 'admin@gridrr.com']
    );
    
    if (result.rows.length > 0) {
      console.log('Admin password updated successfully!');
      console.log('Updated user:', result.rows[0]);
      console.log('\nYou can now login with:');
      console.log('Email: admin@gridrr.com');
      console.log('Password: Admin123');
    } else {
      console.log('No admin user found with email admin@gridrr.com');
    }
  } catch (error) {
    console.error('Error updating admin password:', error);
  } finally {
    await pool.end();
  }
}

updateAdminPassword(); 