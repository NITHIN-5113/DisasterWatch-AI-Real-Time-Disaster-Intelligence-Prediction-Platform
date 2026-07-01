// src/controllers/authController.js
// DisasterWatch — Authentication controller

'use strict';

const bcrypt  = require('bcryptjs');
const prisma  = require('../config/prisma');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  refreshTokenExpiry,
  generateOpaqueToken,
} = require('../utils/jwt');
const { success, created, ApiError } = require('../utils/response');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;

// ── Register ──────────────────────────────────

async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return next(ApiError.conflict('Email already in use'));

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name || null },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    logger.info(`New user registered: ${email}`);
    return created(res, user, 'Account created successfully');
  } catch (err) {
    next(err);
  }
}

// ── Login ─────────────────────────────────────

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    const validPassword = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    // Constant-time check to prevent user enumeration
    if (!user || !validPassword || !user.isActive) {
      return next(ApiError.unauthorized('Invalid email or password'));
    }

    // Issue tokens
    const accessToken  = signAccessToken({ sub: user.id, role: user.role });
    const rawRefresh   = generateOpaqueToken();
    const refreshToken = signRefreshToken({ sub: user.id, jti: rawRefresh });

    await prisma.refreshToken.create({
      data: {
        token: rawRefresh,
        userId: user.id,
        expiresAt: refreshTokenExpiry(),
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info(`User logged in: ${email}`);

    return success(res, {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

// ── Refresh Tokens ────────────────────────────

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return next(ApiError.unauthorized('Invalid or expired refresh token'));
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: payload.jti },
      include: { user: { select: { id: true, role: true, isActive: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return next(ApiError.unauthorized('Refresh token invalid or revoked'));
    }

    if (!stored.user.isActive) {
      return next(ApiError.unauthorized('User account is inactive'));
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const newAccessToken  = signAccessToken({ sub: stored.user.id, role: stored.user.role });
    const newRawRefresh   = generateOpaqueToken();
    const newRefreshToken = signRefreshToken({ sub: stored.user.id, jti: newRawRefresh });

    await prisma.refreshToken.create({
      data: {
        token: newRawRefresh,
        userId: stored.user.id,
        expiresAt: refreshTokenExpiry(),
      },
    });

    return success(res, { accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
}

// ── Logout ────────────────────────────────────

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      let payload;
      try { payload = verifyRefreshToken(refreshToken); } catch { /* already expired is fine */ }

      if (payload?.jti) {
        await prisma.refreshToken.updateMany({
          where: { token: payload.jti, revokedAt: null },
          data:  { revokedAt: new Date() },
        });
      }
    }

    logger.info(`User logged out: ${req.user?.email}`);
    return success(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

// ── Change Password ───────────────────────────

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return next(ApiError.unauthorized('Current password is incorrect'));

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens (force re-login everywhere)
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data:  { revokedAt: new Date() },
    });

    return success(res, null, 'Password changed. Please log in again on all devices.');
  } catch (err) {
    next(err);
  }
}

// ── Me ────────────────────────────────────────

async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, role: true,
        avatarUrl: true, createdAt: true, lastLoginAt: true,
      },
    });
    return success(res, user);
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, logout, changePassword, me };
