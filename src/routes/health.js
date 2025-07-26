const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /health - system health check
router.get('/', async (req, res) => {
  try {
    // Check database connectivity
    let dbStatus = 'operational';
    let dbError = null;
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      dbStatus = 'down';
      dbError = err.message;
    }

    // API status is always operational if this route is hit
    const apiStatus = 'operational';

    // Uptime (process uptime in seconds)
    const uptime = process.uptime();

    // Simulate response time (could be measured in middleware)
    // Here we just give a static value for demo
    const avgResponseTime = 150;

    res.json({
      api: { status: apiStatus },
      database: { status: dbStatus, error: dbError },
      uptime: uptime,
      avgResponseTime: avgResponseTime
    });
  } catch (error) {
    res.status(500).json({ status: 'down', error: error.message });
  }
});

module.exports = router;
