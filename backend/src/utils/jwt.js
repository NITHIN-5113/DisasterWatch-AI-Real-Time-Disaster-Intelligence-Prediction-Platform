// src/utils/jwt.js
// DisasterWatch — JWT helpers

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL     = process.env.JWT_ACCESS_TTL  || '15m';
const REFRESH_TTL    = process.env.JWT_REFRESH_TTL || '7d';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT secrets must be set in environment variables');
}

/**
 * Sign a short-lived access token
 */
function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
    issuer: 'disasterwatch-api',
    audience: 'disasterwatch-client',
  });
}

/**
 * Sign a long-lived refresh token
 */
function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
    issuer: 'disasterwatch-api',
    audience: 'disasterwatch-client',
  });
}

/**
 * Verify an access token — throws on invalid/expired
 */
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET, {
    issuer: 'disasterwatch-api',
    audience: 'disasterwatch-client',
  });
}

/**
 * Verify a refresh token
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET, {
    issuer: 'disasterwatch-api',
    audience: 'disasterwatch-client',
  });
}

/**
 * Calculate refresh token expiry date
 */
function refreshTokenExpiry() {
  const ms = parseDuration(REFRESH_TTL);
  return new Date(Date.now() + ms);
}

/**
 * Generate a cryptographically secure opaque token (for refresh tokens)
 */
function generateOpaqueToken() {
  return crypto.randomBytes(48).toString('hex');
}

// ── helpers ──────────────────────────────────
function parseDuration(str) {
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400000; // default 7 days
  return parseInt(match[1]) * map[match[2]];
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  refreshTokenExpiry,
  generateOpaqueToken,
};
