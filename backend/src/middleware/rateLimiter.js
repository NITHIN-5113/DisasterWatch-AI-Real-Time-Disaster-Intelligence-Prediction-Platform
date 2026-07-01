// src/middleware/rateLimiter.js
// DisasterWatch — Rate limiters (per endpoint type)

'use strict';

const rateLimit = require('express-rate-limit');

const handler = (_req, res) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests — please slow down',
    ts: new Date().toISOString(),
  });
};

/** General API limiter: 200 req / 15 min */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/** Auth endpoints: 10 req / 15 min (brute-force protection) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skipSuccessfulRequests: false,
});

/** Data-heavy endpoints: 30 req / 1 min */
const dataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { globalLimiter, authLimiter, dataLimiter };
