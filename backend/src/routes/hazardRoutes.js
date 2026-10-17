// src/routes/hazardRoutes.js
'use strict';

const router   = require('express').Router();
const ctrl     = require('../controllers/hazardController');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { dataLimiter } = require('../middleware/rateLimiter');
const { listHazards, idParam } = require('../validators/hazardValidator');

// Public read endpoints (no auth required for public dashboards)
// GET  /api/v1/hazards/live?timeframe=24h|7d|30d&type=all|earthquake|flood|storm|fire|volcano
router.get('/live',           ctrl.getLiveEvents);

// GET  /api/v1/hazards/summary?timeframe=24h|7d|30d
router.get('/summary',        ctrl.getDisasterSummary);

// GET  /api/v1/hazards/rainfall-radar
router.get('/rainfall-radar', ctrl.getRainfallRadar);

// GET  /api/v1/hazards
router.get('/',        validate(listHazards, 'query'), ctrl.listHazards);

// GET  /api/v1/hazards/stats
router.get('/stats',   ctrl.getStats);

// GET  /api/v1/hazards/nearby?lat=&lng=&radius=
router.get('/nearby',  ctrl.getNearby);

// GET  /api/v1/hazards/:id
router.get('/:id',     validate(idParam, 'params'), ctrl.getHazard);

// Protected — sync requires at least ANALYST role
// POST /api/v1/hazards/sync?feed=all_day
router.post(
  '/sync',
  dataLimiter,
  authenticate,
  authorize('ANALYST', 'ADMIN'),
  ctrl.syncEarthquakes,
);

module.exports = router;
