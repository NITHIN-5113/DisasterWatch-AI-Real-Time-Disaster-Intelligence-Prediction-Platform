// src/routes/mlRoutes.js
'use strict';

const router   = require('express').Router();
const ctrl     = require('../controllers/mlController');
const { authenticate, authorize } = require('../middleware/auth');

// All ML routes require auth
router.use(authenticate);

// GET  /api/v1/ml/stats
router.get('/stats', ctrl.getMLStats);

// GET  /api/v1/ml/anomalies
router.get('/anomalies', ctrl.listAnomalies);

// GET  /api/v1/ml/high-risk
router.get('/high-risk', ctrl.getHighRisk);

// GET  /api/v1/ml/:eventId
router.get('/:eventId', ctrl.getScore);

// POST /api/v1/ml/scores  (single upsert — ANALYST / ADMIN)
router.post('/scores', authorize('ANALYST', 'ADMIN'), ctrl.upsertScore);

// POST /api/v1/ml/scores/batch  (bulk — ANALYST / ADMIN)
router.post('/scores/batch', authorize('ANALYST', 'ADMIN'), ctrl.batchUpsertScores);

module.exports = router;
