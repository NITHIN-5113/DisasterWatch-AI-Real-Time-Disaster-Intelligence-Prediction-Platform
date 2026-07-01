// src/controllers/userController.js
// DisasterWatch — User profile & preferences controller

'use strict';

const prisma             = require('../config/prisma');
const { success, created, paginated, ApiError } = require('../utils/response');

// ── Get all users (admin only) ────────────────

async function listUsers(req, res, next) {
  try {
    const page    = parseInt(req.query.page    || 1);
    const perPage = parseInt(req.query.perPage || 20);
    const skip    = (page - 1) * perPage;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true,
          role: true, isActive: true, createdAt: true, lastLoginAt: true,
        },
      }),
      prisma.user.count(),
    ]);

    return paginated(res, users, total, page, perPage);
  } catch (err) {
    next(err);
  }
}

// ── Get a single user (admin or self) ────────

async function getUser(req, res, next) {
  try {
    const { id } = req.params;

    // Non-admins can only view themselves
    if (req.user.role !== 'ADMIN' && req.user.id !== id) {
      return next(ApiError.forbidden());
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, role: true,
        avatarUrl: true, isActive: true, emailVerified: true,
        createdAt: true, lastLoginAt: true,
        alerts: true,
      },
    });

    if (!user) return next(ApiError.notFound('User not found'));
    return success(res, user);
  } catch (err) {
    next(err);
  }
}

// ── Update own profile ────────────────────────

async function updateProfile(req, res, next) {
  try {
    const { name, avatarUrl } = req.body;

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(name      !== undefined && { name }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true },
    });

    return success(res, updated, 'Profile updated');
  } catch (err) {
    next(err);
  }
}

// ── Deactivate a user (admin only) ───────────

async function deactivateUser(req, res, next) {
  try {
    const { id } = req.params;
    if (id === req.user.id) return next(ApiError.badRequest('You cannot deactivate your own account'));

    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return success(res, null, 'User deactivated');
  } catch (err) {
    next(err);
  }
}

// ── Saved events ──────────────────────────────

async function getSavedEvents(req, res, next) {
  try {
    const page    = parseInt(req.query.page    || 1);
    const perPage = parseInt(req.query.perPage || 20);
    const skip    = (page - 1) * perPage;

    const [saved, total] = await Promise.all([
      prisma.savedEvent.findMany({
        where: { userId: req.user.id },
        skip,
        take: perPage,
        orderBy: { savedAt: 'desc' },
        include: {
          event: {
            include: { mlScores: true },
          },
        },
      }),
      prisma.savedEvent.count({ where: { userId: req.user.id } }),
    ]);

    return paginated(res, saved, total, page, perPage);
  } catch (err) {
    next(err);
  }
}

async function saveEvent(req, res, next) {
  try {
    const { eventId, notes } = req.body;

    const event = await prisma.hazardEvent.findUnique({ where: { id: eventId } });
    if (!event) return next(ApiError.notFound('Hazard event not found'));

    const saved = await prisma.savedEvent.create({
      data: { userId: req.user.id, eventId, notes },
      include: { event: true },
    });

    return created(res, saved, 'Event saved');
  } catch (err) {
    next(err);
  }
}

async function removeSavedEvent(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await prisma.savedEvent.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) return next(ApiError.notFound('Saved event not found'));

    await prisma.savedEvent.delete({ where: { id } });
    return success(res, null, 'Removed from saved events');
  } catch (err) {
    next(err);
  }
}

// ── Alert Preferences ─────────────────────────

async function getAlerts(req, res, next) {
  try {
    const alerts = await prisma.alertPreference.findMany({
      where: { userId: req.user.id },
      orderBy: { hazardType: 'asc' },
    });
    return success(res, alerts);
  } catch (err) {
    next(err);
  }
}

async function upsertAlert(req, res, next) {
  try {
    const { hazardType, minMagnitude, emailEnabled } = req.body;

    const pref = await prisma.alertPreference.upsert({
      where: { userId_hazardType: { userId: req.user.id, hazardType } },
      update: { minMagnitude, emailEnabled },
      create: { userId: req.user.id, hazardType, minMagnitude, emailEnabled },
    });

    return success(res, pref, 'Alert preference saved');
  } catch (err) {
    next(err);
  }
}

async function deleteAlert(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await prisma.alertPreference.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) return next(ApiError.notFound('Alert preference not found'));

    await prisma.alertPreference.delete({ where: { id } });
    return success(res, null, 'Alert preference removed');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  getUser,
  updateProfile,
  deactivateUser,
  getSavedEvents,
  saveEvent,
  removeSavedEvent,
  getAlerts,
  upsertAlert,
  deleteAlert,
};
