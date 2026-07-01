// src/middleware/auth.js
// DisasterWatch — JWT authentication & role-based authorization

'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const { ApiError }          = require('../utils/response');
const prisma                = require('../config/prisma');

/**
 * authenticate
 * Validates Bearer token and attaches req.user
 */
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(ApiError.unauthorized('Missing or malformed Authorization header'));
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    // Confirm user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return next(ApiError.unauthorized('User account is inactive or not found'));
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Access token expired'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(ApiError.unauthorized('Invalid access token'));
    }
    next(err);
  }
}

/**
 * authorize(...roles)
 * Must be used AFTER authenticate
 */
function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires one of: ${roles.join(', ')}`));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
