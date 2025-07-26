const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const SALT_ROUNDS = 10;

const findAdminByEmail = async (email) => {
  const result = await pool.query(
    'SELECT * FROM admin_users WHERE email = $1',
    [email]
  );
  return result.rows[0];
};

const verifyAdminPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const updateLastLogin = async (adminId) => {
  await pool.query(
    'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
    [adminId]
  );
};

// This function ensures the default admin user exists with the correct password
const ensureDefaultAdmin = async () => {
  const defaultEmail = 'admin@gridrr.com';
  const defaultPassword = 'Admin123';
  const defaultName = 'Admin User';
  
  // Check if default admin exists
  const existingAdmin = await findAdminByEmail(defaultEmail);
  
  if (!existingAdmin) {
    // Hash the default password
    const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
    
    // Insert the default admin
    await pool.query(
      `INSERT INTO admin_users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'superadmin')
       ON CONFLICT (email) DO NOTHING`,
      [defaultEmail, hashedPassword, defaultName]
    );
    console.log('Default admin user created');
  } else {
    // Optionally update the password if it's the default one
    const isDefaultPassword = await bcrypt.compare(defaultPassword, existingAdmin.password_hash);
    if (!isDefaultPassword) {
      const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
      await pool.query(
        'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
        [hashedPassword, existingAdmin.id]
      );
      console.log('Default admin password reset');
    }
  }
};

module.exports = {
  findAdminByEmail,
  verifyAdminPassword,
  updateLastLogin,
  ensureDefaultAdmin
};
