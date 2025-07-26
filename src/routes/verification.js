const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Get all pending verification requests
router.get('/requests', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, first_name, last_name, email FROM users WHERE verification_requested = TRUE AND verified = FALSE');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch verification requests' });
  }
});

// Approve verification
router.post('/approve/:userId', async (req, res) => {
  try {
    await pool.query('UPDATE users SET verified = TRUE, verification_requested = FALSE WHERE id = $1', [req.params.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve verification' });
  }
});

// Reject verification
router.post('/reject/:userId', async (req, res) => {
  try {
    await pool.query('UPDATE users SET verification_requested = FALSE WHERE id = $1', [req.params.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject verification' });
  }
});

// Directly verify any user (admin tool)
router.post('/verify/:userId', async (req, res) => {
  try {
    await pool.query('UPDATE users SET verified = TRUE, verification_requested = FALSE WHERE id = $1', [req.params.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify user' });
  }
});

// Unverify any user (admin tool)
router.post('/unverify/:userId', async (req, res) => {
  try {
    await pool.query('UPDATE users SET verified = FALSE WHERE id = $1', [req.params.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unverify user' });
  }
});

module.exports = router;
