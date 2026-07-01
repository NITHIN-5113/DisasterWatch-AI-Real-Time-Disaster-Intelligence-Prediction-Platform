// src/routes/authRoutes.js
'use strict';

const router   = require('express').Router();
const ctrl     = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authLimiter }  = require('../middleware/rateLimiter');
const schemas  = require('../validators/authValidator');

// Public — stricter rate limit on all auth routes
router.use(authLimiter);

// POST /api/v1/auth/register
router.post('/register', validate(schemas.register), ctrl.register);

// POST /api/v1/auth/login
router.post('/login', validate(schemas.login), ctrl.login);

// POST /api/v1/auth/refresh
router.post('/refresh', validate(schemas.refresh), ctrl.refresh);

// Protected
router.use(authenticate);

// GET  /api/v1/auth/me
router.get('/me', ctrl.me);

// POST /api/v1/auth/logout
router.post('/logout', ctrl.logout);

// PATCH /api/v1/auth/password
router.patch('/password', validate(schemas.changePassword), ctrl.changePassword);

module.exports = router;
