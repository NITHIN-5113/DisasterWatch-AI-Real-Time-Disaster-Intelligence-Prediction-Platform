// src/utils/response.js
// DisasterWatch — Consistent API response wrappers

'use strict';

/**
 * Send a successful response
 */
function success(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ts: new Date().toISOString(),
  });
}

/**
 * Send a created response (201)
 */
function created(res, data, message = 'Created') {
  return success(res, data, message, 201);
}

/**
 * Send a paginated list response
 */
function paginated(res, items, total, page, perPage) {
  res.setHeader('X-Total-Count', total);
  res.setHeader('X-Page', page);
  res.setHeader('X-Per-Page', perPage);

  return res.status(200).json({
    success: true,
    data: items,
    pagination: {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    },
    ts: new Date().toISOString(),
  });
}

/**
 * Build a structured API error (used by errorHandler)
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(msg, details)  { return new ApiError(msg, 400, details); }
  static unauthorized(msg)         { return new ApiError(msg || 'Unauthorized', 401); }
  static forbidden(msg)            { return new ApiError(msg || 'Forbidden', 403); }
  static notFound(msg)             { return new ApiError(msg || 'Not found', 404); }
  static conflict(msg)             { return new ApiError(msg || 'Conflict', 409); }
  static tooMany(msg)              { return new ApiError(msg || 'Too many requests', 429); }
  static internal(msg)             { return new ApiError(msg || 'Internal server error', 500); }
}

module.exports = { success, created, paginated, ApiError };
