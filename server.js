const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const compression = require('compression');
const { initializeDatabase } = require('./src/config/database');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://gridrr.com',
      'https://www.gridrr.com',
      'http://localhost:3000' // TEMP: Allow localhost for landing page fixes. REMOVE BEFORE GOING LIVE.
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// Enable gzip compression for all responses
app.use(compression());

// Import routes
const path = require('path');
const authRoutes = require('./src/routes/auth');
const adminAuthRoutes = require('./src/routes/admin/auth');
const healthRoutes = require('./src/routes/health');
const adminRoutes = require('./src/routes/admin');
const employeesRoutes = require('./src/routes/employees');
const verificationRoutes = require('./src/routes/verification');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', require('./src/routes/profile'));
app.use('/api/posts', require('./src/routes/post'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/verification', verificationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

// Initialize database and start server
const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app; 