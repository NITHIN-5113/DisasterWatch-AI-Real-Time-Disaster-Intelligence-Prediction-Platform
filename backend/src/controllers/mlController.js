// src/controllers/mlController.js
// DisasterWatch — ML scores controller
// Stores & serves ML inference results; the actual TF.js computation
// still runs client-side. This layer persists scores so they can be
// queried, compared over time, and included in exports.

'use strict';

const prisma   = require('../config/prisma');
const { success, created, paginated, ApiError } = require('../utils/response');
const Joi      = require('joi');

// ── Validation schemas ────────────────────────

const scoreSchema = Joi.object({
  eventId:        Joi.string().required(),
  magPrediction:  Joi.number().min(0).max(10).optional().allow(null),
  aftershockProb: Joi.number().min(0).max(1).optional().allow(null),
  clusterIndex:   Joi.number().integer().min(0).optional().allow(null),
  riskScore:      Joi.number().min(0).max(100).optional().allow(null),
  riskLevel:      Joi.string().valid('Low', 'Minor', 'Moderate', 'Severe', 'Extreme').optional().allow(null),
  anomalyZScore:  Joi.number().optional().allow(null),
  isAnomaly:      Joi.boolean().default(false),
});

const batchSchema = Joi.object({
  scores: Joi.array().items(scoreSchema).min(1).max(500).required(),
});

// ── Upsert a single ML score ──────────────────

async function upsertScore(req, res, next) {
  try {
    const { error, value } = scoreSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return next(ApiError.badRequest('Validation failed', error.details.map(d => ({
        field: d.path.join('.'), message: d.message,
      }))));
    }

    const event = await prisma.hazardEvent.findUnique({ where: { id: value.eventId } });
    if (!event) return next(ApiError.notFound('Hazard event not found'));

    const score = await prisma.mLScore.upsert({
      where: { eventId: value.eventId },
      update:  { ...value, computedAt: new Date() },
      create:  value,
    });

    // Reflect top-level riskScore on the event row for quick sorting
    if (value.riskScore != null) {
      await prisma.hazardEvent.update({
        where: { id: value.eventId },
        data:  { riskScore: value.riskScore, riskLevel: value.riskLevel },
      });
    }

    return success(res, score, 'ML score saved');
  } catch (err) {
    next(err);
  }
}

// ── Batch upsert ML scores ────────────────────

async function batchUpsertScores(req, res, next) {
  try {
    const { error, value } = batchSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return next(ApiError.badRequest('Validation failed', error.details.map(d => ({
        field: d.path.join('.'), message: d.message,
      }))));
    }

    let saved = 0;
    for (const s of value.scores) {
      try {
        await prisma.mLScore.upsert({
          where:  { eventId: s.eventId },
          update: { ...s, computedAt: new Date() },
          create: s,
        });
        if (s.riskScore != null) {
          await prisma.hazardEvent.update({
            where: { id: s.eventId },
            data:  { riskScore: s.riskScore, riskLevel: s.riskLevel },
          });
        }
        saved++;
      } catch { /* skip invalid eventIds */ }
    }

    return success(res, { submitted: value.scores.length, saved });
  } catch (err) {
    next(err);
  }
}

// ── Get ML score for an event ─────────────────

async function getScore(req, res, next) {
  try {
    const { eventId } = req.params;

    const score = await prisma.mLScore.findUnique({ where: { eventId } });
    if (!score) return next(ApiError.notFound('No ML score for this event'));

    return success(res, score);
  } catch (err) {
    next(err);
  }
}

// ── List anomalies ────────────────────────────

async function listAnomalies(req, res, next) {
  try {
    const page    = parseInt(req.query.page    || 1);
    const perPage = parseInt(req.query.perPage || 20);
    const skip    = (page - 1) * perPage;

    const [anomalies, total] = await Promise.all([
      prisma.mLScore.findMany({
        where:   { isAnomaly: true },
        skip,
        take:    perPage,
        orderBy: { anomalyZScore: 'desc' },
        include: { event: true },
      }),
      prisma.mLScore.count({ where: { isAnomaly: true } }),
    ]);

    return paginated(res, anomalies, total, page, perPage);
  } catch (err) {
    next(err);
  }
}

// ── High-risk events ──────────────────────────

async function getHighRisk(req, res, next) {
  try {
    const threshold = parseFloat(req.query.threshold || 60);
    const limit     = parseInt(req.query.limit || 20);

    const scores = await prisma.mLScore.findMany({
      where:   { riskScore: { gte: threshold } },
      orderBy: { riskScore: 'desc' },
      take:    limit,
      include: { event: true },
    });

    return success(res, scores);
  } catch (err) {
    next(err);
  }
}

// ── ML summary stats ──────────────────────────

async function getMLStats(req, res, next) {
  try {
    const [total, anomalyCount, riskBreakdown, avgRisk] = await Promise.all([
      prisma.mLScore.count(),
      prisma.mLScore.count({ where: { isAnomaly: true } }),
      prisma.mLScore.groupBy({
        by: ['riskLevel'],
        _count: { _all: true },
        where:  { riskLevel: { not: null } },
      }),
      prisma.mLScore.aggregate({
        _avg: { riskScore: true, aftershockProb: true },
      }),
    ]);

    return success(res, {
      total,
      anomalyCount,
      anomalyRate: total > 0 ? parseFloat((anomalyCount / total).toFixed(4)) : 0,
      riskBreakdown: Object.fromEntries(riskBreakdown.map(r => [r.riskLevel, r._count._all])),
      avgRiskScore: avgRisk._avg.riskScore
        ? parseFloat(avgRisk._avg.riskScore.toFixed(2)) : null,
      avgAftershockProb: avgRisk._avg.aftershockProb
        ? parseFloat(avgRisk._avg.aftershockProb.toFixed(4)) : null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  upsertScore,
  batchUpsertScores,
  getScore,
  listAnomalies,
  getHighRisk,
  getMLStats,
};
