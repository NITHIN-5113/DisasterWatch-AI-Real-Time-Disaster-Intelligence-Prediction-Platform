// src/app.js
// DisasterWatch — Express application factory

'use strict';

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');

const { corsOptions }     = require('./config/cors');
const { globalLimiter }   = require('./middleware/rateLimiter');
const errorHandler        = require('./middleware/errorHandler');
const notFound            = require('./middleware/notFound');

const authRoutes    = require('./routes/authRoutes');
const userRoutes    = require('./routes/userRoutes');
const hazardRoutes  = require('./routes/hazardRoutes');
const mlRoutes      = require('./routes/mlRoutes');
const exportRoutes  = require('./routes/exportRoutes');

const app = express();

// ── Security ──────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));

// ── Logging ───────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsing ──────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Rate limiting ─────────────────────────────
app.use('/api/', globalLimiter);

// ── Health check ──────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────
app.use('/api/v1/auth',    authRoutes);
app.use('/api/v1/users',   userRoutes);
app.use('/api/v1/hazards', hazardRoutes);
app.use('/api/v1/ml',      mlRoutes);
app.use('/api/v1/export',  exportRoutes);

// ── Error handling ────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
