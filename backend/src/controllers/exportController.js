// src/controllers/exportController.js
// DisasterWatch — Data export controller (CSV & JSON) with audit logging

'use strict';

const prisma   = require('../config/prisma');
const { ApiError } = require('../utils/response');
const logger   = require('../utils/logger');

// ── Helpers ───────────────────────────────────

function toCSVRow(fields, obj) {
  return fields
    .map(f => {
      const raw = f.split('.').reduce((o, k) => o?.[k], obj);
      const str = raw == null ? '' : String(raw);
      return /[,"\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    })
    .join(',');
}

// ── Export earthquake events ──────────────────

async function exportHazards(req, res, next) {
  try {
    const format  = (req.query.format || 'csv').toLowerCase();
    const type    = req.query.type;
    const minMag  = req.query.minMag !== undefined ? parseFloat(req.query.minMag) : undefined;
    const from    = req.query.from ? new Date(req.query.from) : undefined;
    const to      = req.query.to   ? new Date(req.query.to)   : undefined;
    const limit   = Math.min(parseInt(req.query.limit || 5000), 10000);

    if (!['csv', 'json'].includes(format)) {
      return next(ApiError.badRequest('format must be csv or json'));
    }

    const where = {};
    if (type)   where.type      = type.toUpperCase();
    if (minMag !== undefined) where.magnitude = { gte: minMag };
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = from;
      if (to)   where.occurredAt.lte = to;
    }

    const events = await prisma.hazardEvent.findMany({
      where,
      take: limit,
      orderBy: { occurredAt: 'desc' },
      include: { mlScores: true },
    });

    // Audit log
    await prisma.exportLog.create({
      data: {
        userId:   req.user.id,
        filename: `hazards_export.${format}`,
        rowCount: events.length,
        filters:  { type, minMag, from, to, limit },
      },
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="hazards_export.json"`);
      return res.json({ total: events.length, data: events });
    }

    // CSV
    const fields = [
      'id', 'externalId', 'type', 'magnitude', 'depth',
      'latitude', 'longitude', 'place', 'title',
      'riskScore', 'riskLevel', 'occurredAt', 'fetchedAt',
      'mlScores.0.aftershockProb', 'mlScores.0.clusterIndex',
    ];

    const header = [
      'id', 'externalId', 'type', 'magnitude', 'depth',
      'latitude', 'longitude', 'place', 'title',
      'riskScore', 'riskLevel', 'occurredAt', 'fetchedAt',
      'aftershockProb', 'clusterIndex',
    ].join(',');

    const rows = [header, ...events.map(e => toCSVRow(fields, e))];
    const csv  = rows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hazards_export.csv"`);
    res.setHeader('X-Total-Count', events.length);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

// ── Export ML scores ──────────────────────────

async function exportMLScores(req, res, next) {
  try {
    const format  = (req.query.format || 'csv').toLowerCase();
    const limit   = Math.min(parseInt(req.query.limit || 5000), 10000);
    const onlyAnomalies = req.query.anomalies === 'true';

    if (!['csv', 'json'].includes(format)) {
      return next(ApiError.badRequest('format must be csv or json'));
    }

    const where = onlyAnomalies ? { isAnomaly: true } : {};
    const scores = await prisma.mLScore.findMany({
      where,
      take: limit,
      orderBy: { computedAt: 'desc' },
      include: {
        event: {
          select: { externalId: true, type: true, place: true, occurredAt: true },
        },
      },
    });

    await prisma.exportLog.create({
      data: {
        userId:   req.user.id,
        filename: `ml_scores.${format}`,
        rowCount: scores.length,
        filters:  { onlyAnomalies, limit },
      },
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="ml_scores.json"`);
      return res.json({ total: scores.length, data: scores });
    }

    const fields = [
      'id', 'eventId', 'event.externalId', 'event.type', 'event.place',
      'event.occurredAt', 'magPrediction', 'aftershockProb',
      'clusterIndex', 'riskScore', 'riskLevel', 'isAnomaly',
      'anomalyZScore', 'computedAt',
    ];

    const header = fields.join(',');
    const rows   = [header, ...scores.map(s => toCSVRow(fields, s))];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ml_scores.csv"`);
    res.setHeader('X-Total-Count', scores.length);
    return res.send(rows.join('\n'));
  } catch (err) {
    next(err);
  }
}

// ── Export audit log (admin only) ─────────────

async function getExportLogs(req, res, next) {
  try {
    const page    = parseInt(req.query.page    || 1);
    const perPage = parseInt(req.query.perPage || 50);
    const skip    = (page - 1) * perPage;

    const [logs, total] = await Promise.all([
      prisma.exportLog.findMany({
        skip, take: perPage,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.exportLog.count(),
    ]);

    res.setHeader('X-Total-Count', total);
    return res.json({ success: true, data: logs, pagination: { total, page, perPage } });
  } catch (err) {
    next(err);
  }
}

module.exports = { exportHazards, exportMLScores, getExportLogs };
