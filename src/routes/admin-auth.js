const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { findAdminByEmail, verifyAdminPassword, updateLastLogin, ensureDefaultAdmin } = require('../models/admin-user');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ensure default admin exists when the server starts
ensureDefaultAdmin();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find admin by email
    const admin = await findAdminByEmail(email);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await verifyAdminPassword(password, admin.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await updateLastLogin(admin.id);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: admin.id, 
        email: admin.email,
        role: admin.role,
        name: admin.name
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '8h' }
    );

    // Return token and user info (excluding password_hash)
    const { password_hash, ...adminData } = admin;
    res.json({
      token,
      user: {
        ...adminData,
        name: admin.name || 'Admin User'
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current admin profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const admin = await findAdminByEmail(req.user.email);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    // Exclude password_hash from response
    const { password_hash, ...adminData } = admin;
    res.json(adminData);
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
