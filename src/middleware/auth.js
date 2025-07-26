const jwt = require('jsonwebtoken');
const { findAdminByEmail } = require('../models/admin-user');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Middleware to verify admin user
const requireAdmin = async (req, res, next) => {
  try {
    const admin = await findAdminByEmail(req.user?.email);
    if (!admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Middleware to verify superadmin
const requireSuperAdmin = async (req, res, next) => {
  try {
    const admin = await findAdminByEmail(req.user?.email);
    if (!admin || admin.role !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin access required' });
    }
    next();
  } catch (error) {
    console.error('Superadmin auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireSuperAdmin
};
