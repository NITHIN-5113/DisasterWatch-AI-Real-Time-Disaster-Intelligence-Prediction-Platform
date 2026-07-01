// src/middleware/errorHandler.js
// DisasterWatch — Centralized error handler

'use strict';

const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, _next) {
  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `A record with that ${field} already exists`,
      ts: new Date().toISOString(),
    });
  }

  // Prisma not-found
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found',
      ts: new Date().toISOString(),
    });
  }

  // CORS error
  if (err.message && err.message.startsWith('CORS')) {
    return res.status(403).json({
      success: false,
      message: err.message,
      ts: new Date().toISOString(),
    });
  }

  // Operational (expected) errors
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      ...(err.details && { details: err.details }),
      ts: new Date().toISOString(),
    });
  }

  // Unexpected errors — log full stack, hide details from client
  logger.error(err);

  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    ts: new Date().toISOString(),
  });
};
