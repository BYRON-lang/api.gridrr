const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { bucket } = require('../config/firebase');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// List all employees
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM employees ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employees', details: err.message });
  }
});

// Get single employee
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employee', details: err.message });
  }
});

// Create employee (with optional avatar upload)
router.post('/', upload.single('avatar'), async (req, res) => {
  try {
    const { name, email, role, department, status, can_chat } = req.body;
    let avatar_url = null;
    if (req.file) {
      const blob = bucket.file(`avatars/${Date.now()}_${req.file.originalname}`);
      const blobStream = blob.createWriteStream({ metadata: { contentType: req.file.mimetype } });
      blobStream.end(req.file.buffer);
      await new Promise((resolve, reject) => {
        blobStream.on('finish', resolve);
        blobStream.on('error', reject);
      });
      avatar_url = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
    }
    const { rows } = await pool.query(
      `INSERT INTO employees (name, email, role, department, status, can_chat, avatar_url, last_active) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      [name, email, role, department, status || 'active', can_chat !== 'false', avatar_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create employee', details: err.message });
  }
});

// Update employee (with optional avatar upload)
router.put('/:id', upload.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, department, status, can_chat } = req.body;
    let avatar_url = req.body.avatar_url || null;
    if (req.file) {
      const blob = bucket.file(`avatars/${Date.now()}_${req.file.originalname}`);
      const blobStream = blob.createWriteStream({ metadata: { contentType: req.file.mimetype } });
      blobStream.end(req.file.buffer);
      await new Promise((resolve, reject) => {
        blobStream.on('finish', resolve);
        blobStream.on('error', reject);
      });
      avatar_url = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
    }
    const { rows } = await pool.query(
      `UPDATE employees SET name=$1, email=$2, role=$3, department=$4, status=$5, can_chat=$6, avatar_url=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, email, role, department, status, can_chat !== 'false', avatar_url, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update employee', details: err.message });
  }
});

// Delete employee
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM employees WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete employee', details: err.message });
  }
});

module.exports = router;
