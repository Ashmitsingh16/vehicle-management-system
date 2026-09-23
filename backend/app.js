const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
require('./config/production')();
require('./config/jwt').getJwtSecret();

const app = express();
app.disable('x-powered-by');
require('./middleware/rateLimit').configureProxy(app);

// Middleware
app.use(bodyParser.json());

// CORS — restrict to frontend origin in production, allow all in development
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(value => value.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(Object.assign(new Error('Origin is not allowed'), { status: 403 }));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Database connection
const connectDB = require('./config/db');
connectDB();

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/contacts', require('./routes/contactRoutes'));
app.use('/api/members', require('./routes/memberRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/emergency', require('./routes/emergencyRoutes'));
app.use('/api/tracking', require('./routes/trackingRoutes'));

// Health check route
app.get('/api/health', require('./middleware/health')());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.status === 403 ? 'Origin is not allowed' : 'Request failed' });
});

module.exports = app;