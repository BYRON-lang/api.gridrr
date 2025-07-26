const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// POST /analytics - record analytics event
router.post('/', async (req, res) => {
  try {
    const { userId, country, page, referrer, userAgent, app, deviceType } = req.body;
    await pool.query(
      `INSERT INTO analytics (user_id, country, page, referrer, user_agent, app, deviceType, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId, country, page, referrer, userAgent, app, deviceType]
    );
    res.status(201).json({ message: 'Analytics recorded' });
  } catch (err) {
    console.error('Failed to record analytics:', err);
    res.status(500).json({ message: 'Failed to record analytics' });
  }
});

module.exports = router;
