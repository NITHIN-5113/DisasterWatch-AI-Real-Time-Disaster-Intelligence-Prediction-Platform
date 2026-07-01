// src/routes/exportRoutes.js
'use strict';

const router   = require('express').Router();
const ctrl     = require('../controllers/exportController');
const { authenticate, authorize } = require('../middleware/auth');
const { dataLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);
router.use(dataLimiter);

// GET /api/v1/export/hazards?format=csv&type=EARTHQUAKE&minMag=4&from=&to=&limit=
router.get('/hazards', ctrl.exportHazards);

// GET /api/v1/export/ml?format=csv&anomalies=true
router.get('/ml', ctrl.exportMLScores);

// GET /api/v1/export/logs  (admin audit)
router.get('/logs', authorize('ADMIN'), ctrl.getExportLogs);

module.exports = router;
