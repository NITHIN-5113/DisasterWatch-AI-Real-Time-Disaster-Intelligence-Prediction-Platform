// src/controllers/hazardController.js
// DisasterWatch — Hazard events controller
// Fetches from USGS (and simulated endpoints for other hazard types),
// caches results in Postgres, and exposes a query API.

'use strict';

const prisma             = require('../config/prisma');
const { success, created, paginated, ApiError } = require('../utils/response');
const logger             = require('../utils/logger');

// ── USGS feed URLs ────────────────────────────
const USGS_FEEDS = {
  all_hour:  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  all_day:   'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
  all_week:  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
  all_month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson',
  sig_month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson',
};

// ── List hazard events (with filters) ────────

async function listHazards(req, res, next) {
  try {
    const {
      type, minMag, maxMag, from, to,
      page, perPage, sortBy, order,
    } = req.query;

    const skip  = (page - 1) * perPage;
    const where = {};

    if (type)   where.type      = type;
    if (minMag !== undefined || maxMag !== undefined) {
      where.magnitude = {};
      if (minMag !== undefined) where.magnitude.gte = minMag;
      if (maxMag !== undefined) where.magnitude.lte = maxMag;
    }
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = new Date(from);
      if (to)   where.occurredAt.lte = new Date(to);
    }

    const orderClause = { [sortBy]: order };

    const [events, total] = await Promise.all([
      prisma.hazardEvent.findMany({
        where,
        skip,
        take: perPage,
        orderBy: orderClause,
        include: { mlScores: true },
      }),
      prisma.hazardEvent.count({ where }),
    ]);

    return paginated(res, events, total, page, perPage);
  } catch (err) {
    next(err);
  }
}

// ── Get single hazard event ───────────────────

async function getHazard(req, res, next) {
  try {
    const { id } = req.params;

    const event = await prisma.hazardEvent.findUnique({
      where: { id },
      include: { mlScores: true, savedBy: { select: { userId: true } } },
    });

    if (!event) return next(ApiError.notFound('Hazard event not found'));
    return success(res, event);
  } catch (err) {
    next(err);
  }
}

// ── Sync earthquakes from USGS ────────────────

async function syncEarthquakes(req, res, next) {
  try {
    const feed = req.query.feed || 'all_day';
    const url  = USGS_FEEDS[feed];

    if (!url) {
      return next(ApiError.badRequest(
        `Unknown feed. Valid options: ${Object.keys(USGS_FEEDS).join(', ')}`
      ));
    }

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      throw new Error(`USGS responded with ${response.status}`);
    }

    const geojson   = await response.json();
    const features  = geojson.features || [];
    let upserted    = 0;

    // Upsert in batches of 50 to avoid overwhelming the DB
    const BATCH = 50;
    for (let i = 0; i < features.length; i += BATCH) {
      const batch = features.slice(i, i + BATCH);

      await Promise.all(batch.map(async (f) => {
        const [lng, lat, depth] = f.geometry.coordinates;
        try {
          await prisma.hazardEvent.upsert({
            where: { externalId: f.id },
            update: {
              magnitude:  f.properties.mag,
              depth,
              place:      f.properties.place,
              title:      f.properties.title,
              url:        f.properties.url,
              rawData:    f,
              updatedAt:  new Date(),
            },
            create: {
              externalId: f.id,
              type:       'EARTHQUAKE',
              magnitude:  f.properties.mag,
              depth,
              latitude:   lat,
              longitude:  lng,
              place:      f.properties.place,
              title:      f.properties.title,
              url:        f.properties.url,
              rawData:    f,
              occurredAt: new Date(f.properties.time),
            },
          });
          upserted++;
        } catch (upsertErr) {
          logger.warn(`Skipping event ${f.id}: ${upsertErr.message}`);
        }
      }));
    }

    logger.info(`USGS sync (${feed}): ${upserted}/${features.length} events upserted`);
    return success(res, { feed, total: features.length, upserted });
  } catch (err) {
    next(err);
  }
}

// ── Stats summary ─────────────────────────────

async function getStats(req, res, next) {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

    const [total, last24h, last7d, byType, avgMag] = await Promise.all([
      prisma.hazardEvent.count(),
      prisma.hazardEvent.count({ where: { occurredAt: { gte: since24h } } }),
      prisma.hazardEvent.count({ where: { occurredAt: { gte: since7d } } }),
      prisma.hazardEvent.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      prisma.hazardEvent.aggregate({
        _avg: { magnitude: true },
        where: { type: 'EARTHQUAKE', magnitude: { not: null } },
      }),
    ]);

    return success(res, {
      total,
      last24h,
      last7d,
      byType: Object.fromEntries(byType.map(r => [r.type, r._count._all])),
      avgMagnitude: avgMag._avg.magnitude
        ? parseFloat(avgMag._avg.magnitude.toFixed(2))
        : null,
    });
  } catch (err) {
    next(err);
  }
}

// ── Nearby events ─────────────────────────────
// Uses a simple bounding-box approximation (Haversine via app layer)

async function getNearby(req, res, next) {
  try {
    const lat    = parseFloat(req.query.lat);
    const lng    = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius || 500); // km

    if (isNaN(lat) || isNaN(lng)) {
      return next(ApiError.badRequest('lat and lng query parameters are required'));
    }

    // 1° lat ≈ 111 km
    const latDelta = radius / 111;
    const lngDelta = radius / (111 * Math.cos(lat * Math.PI / 180));

    const events = await prisma.hazardEvent.findMany({
      where: {
        latitude:  { gte: lat - latDelta, lte: lat + latDelta },
        longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
      include: { mlScores: true },
    });

    return success(res, events);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listHazards,
  getHazard,
  syncEarthquakes,
  getStats,
  getNearby,
};
