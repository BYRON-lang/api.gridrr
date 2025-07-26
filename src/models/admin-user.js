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

module.exports = {
  findAdminByEmail,
  verifyAdminPassword,
  updateLastLogin
};
