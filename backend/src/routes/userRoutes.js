// src/routes/userRoutes.js
'use strict';

const router   = require('express').Router();
const ctrl     = require('../controllers/userController');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { alertPreference } = require('../validators/hazardValidator');
const Joi = require('joi');

// All user routes require authentication
router.use(authenticate);

const profileSchema = Joi.object({
  name:      Joi.string().min(1).max(100).trim().optional(),
  avatarUrl: Joi.string().uri().max(500).optional().allow(null, ''),
});

const savedEventSchema = Joi.object({
  eventId: Joi.string().required(),
  notes:   Joi.string().max(500).optional().allow('', null),
});

// ── Profile ───────────────────────────────────
// PATCH /api/v1/users/me
router.patch('/me', validate(profileSchema), ctrl.updateProfile);

// ── Admin: list / manage users ────────────────
// GET  /api/v1/users
router.get('/', authorize('ADMIN'), ctrl.listUsers);

// GET  /api/v1/users/:id
router.get('/:id', ctrl.getUser);

// DELETE /api/v1/users/:id  (admin only — soft delete)
router.delete('/:id', authorize('ADMIN'), ctrl.deactivateUser);

// ── Saved events ──────────────────────────────
// GET  /api/v1/users/saved
router.get('/saved', ctrl.getSavedEvents);

// POST /api/v1/users/saved
router.post('/saved', validate(savedEventSchema), ctrl.saveEvent);

// DELETE /api/v1/users/saved/:id
router.delete('/saved/:id', ctrl.removeSavedEvent);

// ── Alert preferences ─────────────────────────
// GET  /api/v1/users/alerts
router.get('/alerts', ctrl.getAlerts);

// POST /api/v1/users/alerts
router.post('/alerts', validate(alertPreference), ctrl.upsertAlert);

// DELETE /api/v1/users/alerts/:id
router.delete('/alerts/:id', ctrl.deleteAlert);

module.exports = router;
