// backend/src/services/liveDisasterService.js
// DisasterWatch — Authoritative Live Multi-Hazard Aggregation & Normalization Engine
// Integrates real, verified data from USGS, NASA EONET v3, and GDACS
// Zero mock, simulated, or placeholder data.

'use strict';

const logger = require('../utils/logger');

const CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes
const cache = {
  sources: {
    usgs: {},
    nasa: {},
    gdacs: {}
  },
  timestamps: {}
};

// ─── Haversine Distance in Kilometres ─────────────────────────────────────────
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Coordinate & Centroid Calculation for Complex Geometry ──────────────────
function extractCentroid(geometry) {
  if (!geometry) return null;
  const coords = geometry.coordinates;
  if (!coords || !Array.isArray(coords)) return null;

  // Single Point [lng, lat] or [lng, lat, depth]
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return { lng: coords[0], lat: coords[1], depth: coords[2] || null };
  }

  // LineString / MultiPoint [[lng, lat], ...]
  if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
    let sumLat = 0;
    let sumLng = 0;
    const len = coords.length;
    for (let i = 0; i < len; i++) {
      sumLng += coords[i][0];
      sumLat += coords[i][1];
    }
    return { lng: sumLng / len, lat: sumLat / len, depth: null };
  }

  // Polygon [[[lng, lat], ...]]
  if (Array.isArray(coords[0]) && Array.isArray(coords[0][0]) && typeof coords[0][0][0] === 'number') {
    const ring = coords[0];
    let sumLat = 0;
    let sumLng = 0;
    const len = ring.length;
    for (let i = 0; i < len; i++) {
      sumLng += ring[i][0];
      sumLat += ring[i][1];
    }
    return { lng: sumLng / len, lat: sumLat / len, depth: null };
  }

  return null;
}

// ─── Region Heuristic with Global Coverage ──────────────────────────────────
function determineRegion(lat, lng, countryHint = '') {
  if (countryHint && countryHint.trim() && countryHint !== 'Unknown') {
    return countryHint.trim();
  }
  if (lat >= 8 && lat <= 37 && lng >= 68 && lng <= 97) return 'India & South Asia';
  if (lat >= 24 && lat <= 46 && lng >= 122 && lng <= 146) return 'Japan & East Asia';
  if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) return 'United States';
  if (lat >= 48 && lat <= 70 && lng >= -140 && lng <= -52) return 'Canada & Arctic';
  if (lat >= 35 && lat <= 71 && lng >= -10 && lng <= 40) return 'Europe Region';
  if (lat >= -55 && lat <= 13 && lng >= -82 && lng <= -34) return 'South America';
  if (lat >= -35 && lat <= 38 && lng >= -18 && lng <= 52) return 'Africa Region';
  if (lat >= -45 && lat <= -10 && lng >= 112 && lng <= 154) return 'Australia';
  if (lat >= -11 && lat <= 20 && lng >= 95 && lng <= 141) return 'Southeast Asia';
  if (lat >= 50 && lat <= 75 && lng >= 30 && lng <= 180) return 'North Eurasia / Russia';
  return 'International Waters / Territory';
}

// ─── Fetch with Exponential Backoff ──────────────────────────────────────────
async function fetchWithRetry(url, options = {}, retries = 2, backoffMs = 500) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt)));
        attempt++;
        continue;
      }
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt)));
      attempt++;
    }
  }
}

// ─── 1. USGS Earthquakes ─────────────────────────────────────────────────────
async function fetchUSGSEarthquakes(timeframe = '24h') {
  const feeds = {
    '24h': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    '7d':  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
    '30d': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson'
  };
  const url = feeds[timeframe] || feeds['24h'];

  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'DisasterWatch/2.0 (operations-command-center; contact: admin@disasterwatch.dev)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    }, 1);

    const data = await res.json();
    const features = data.features || [];

    const parsed = [];
    for (const f of features) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;

      const lng = coords[0];
      const lat = coords[1];
      const depth = coords[2] !== undefined ? parseFloat(coords[2].toFixed(1)) : null;
      const mag = f.properties?.mag !== null && f.properties?.mag !== undefined
        ? parseFloat(f.properties.mag.toFixed(1))
        : null;

      // Validate coordinate ranges
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      // Skip Null Island placeholder if magnitude is null
      if (lat === 0 && lng === 0 && mag === null) continue;

      const timeMs = f.properties?.time;
      const place = f.properties?.place || 'Unknown Location';
      const region = determineRegion(lat, lng);

      let severity = 'low';
      if (mag >= 6.5) severity = 'critical';
      else if (mag >= 5.0) severity = 'high';
      else if (mag >= 4.0) severity = 'medium';

      parsed.push({
        id: `usgs_${f.id}`,
        externalId: String(f.id),
        type: 'earthquake',
        category: 'Earthquake',
        title: f.properties?.title || `M ${mag || '?'} Earthquake - ${place}`,
        latitude: lat,
        longitude: lng,
        magnitude: mag,
        unit: 'Richter',
        depth,
        severity,
        location: place,
        region,
        eventTime: timeMs ? new Date(timeMs).toISOString() : new Date().toISOString(),
        status: f.properties?.status ? `Confirmed (${f.properties.status})` : 'Confirmed',
        source: 'USGS Earthquake Hazards Program',
        sourceUrl: f.properties?.url || 'https://earthquake.usgs.gov/',
        rawData: JSON.stringify(f)
      });
    }

    cache.sources.usgs[timeframe] = parsed;
    cache.timestamps[`usgs_${timeframe}`] = Date.now();
    return { data: parsed, status: 'ok' };
  } catch (err) {
    logger.warn(`[liveDisasterService] USGS fetch error (${timeframe}): ${err.message}`);
    if (cache.sources.usgs[timeframe]) {
      return { data: cache.sources.usgs[timeframe], status: 'cached' };
    }
    return { data: [], status: 'failed', error: err.message };
  }
}

// ─── 2. NASA EONET v3 ─────────────────────────────────────────────────────────
async function fetchNASAEONET(timeframe = '24h') {
  const daysMap = { '24h': 3, '7d': 7, '30d': 30 };
  const days = daysMap[timeframe] || 7;
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=${days}`;

  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'DisasterWatch/2.0 (disaster-monitoring-platform)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(18000)
    }, 1);

    const data = await res.json();
    const events = data.events || [];
    const normalized = [];

    for (const ev of events) {
      const catId = ev.categories?.[0]?.id;
      let type = 'other';
      let category = ev.categories?.[0]?.title || 'Natural Hazard';

      if (catId === 'wildfires') {
        type = 'fire';
        category = 'Wildfire';
      } else if (catId === 'severeStorms') {
        type = 'storm';
        category = 'Tropical Cyclone / Severe Storm';
      } else if (catId === 'volcanoes') {
        type = 'volcano';
        category = 'Volcano Eruption';
      } else if (catId === 'floods') {
        type = 'flood';
        category = 'Flood';
      }

      const geometries = ev.geometry || [];
      if (geometries.length === 0) continue;
      const latestGeo = geometries[geometries.length - 1];

      const centroid = extractCentroid(latestGeo);
      if (!centroid) continue;
      const { lat, lng } = centroid;

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

      const sourceObj = ev.sources?.[0] || {};
      const sourceUrl = sourceObj.url || 'https://eonet.gsfc.nasa.gov/';
      const sourceName = sourceObj.id
        ? `NASA EONET (${sourceObj.id.toUpperCase()})`
        : 'NASA Earth Observatory (EONET)';
      const region = determineRegion(lat, lng);

      let magnitude = null;
      let unit = null;
      if (latestGeo.magnitudeValue !== undefined && latestGeo.magnitudeValue !== null) {
        magnitude = parseFloat(latestGeo.magnitudeValue);
        unit = latestGeo.magnitudeUnit || '';
      }

      let severity = 'medium';
      if (type === 'storm') {
        if (magnitude && magnitude >= 64) severity = 'critical'; // >= Hurricane force
        else severity = 'high';
      } else if (type === 'fire') {
        severity = 'high';
      } else if (type === 'volcano') {
        severity = 'high';
      }

      normalized.push({
        id: `nasa_${ev.id}`,
        externalId: String(ev.id),
        type,
        category,
        title: ev.title || `${category} Event`,
        latitude: lat,
        longitude: lng,
        magnitude,
        unit,
        depth: null,
        severity,
        location: ev.title,
        region,
        eventTime: latestGeo.date ? new Date(latestGeo.date).toISOString() : new Date().toISOString(),
        status: 'Active / Observed',
        source: sourceName,
        sourceUrl,
        rawData: JSON.stringify(ev)
      });
    }

    cache.sources.nasa[timeframe] = normalized;
    cache.timestamps[`nasa_${timeframe}`] = Date.now();
    return { data: normalized, status: 'ok' };
  } catch (err) {
    logger.warn(`[liveDisasterService] NASA EONET fetch error (${timeframe}): ${err.message}`);
    if (cache.sources.nasa[timeframe]) {
      return { data: cache.sources.nasa[timeframe], status: 'cached' };
    }
    return { data: [], status: 'failed', error: err.message };
  }
}

// ─── 3. GDACS Global Disaster Alert and Coordination System ───────────────────
async function fetchGDACSEvents(timeframe = '24h') {
  const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';

  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'DisasterWatch/2.0 (disaster-response-platform)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(18000)
    }, 1);

    const json = await res.json();
    const features = json.features || [];
    const normalized = [];

    const now = Date.now();
    const timeLimits = {
      '24h': 48 * 60 * 60 * 1000, // 48h to avoid dropping major ongoing events
      '7d':  7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    const maxAge = timeLimits[timeframe] || timeLimits['24h'];

    for (const f of features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!coords || !Array.isArray(coords)) continue;

      const lng = coords[0];
      const lat = coords[1];
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) continue;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

      // Determine active status: keep active events regardless of start date
      const isCurrent = p.iscurrent === 'true' || p.iscurrent === true;
      const dateStr = p.datemodified || p.todate || p.fromdate;
      const eventTime = dateStr ? new Date(dateStr).getTime() : now;

      // Filter non-active events if past timeframe window
      if (!isCurrent && (now - eventTime > maxAge) && timeframe !== '30d') continue;

      const eventType = (p.eventtype || '').toUpperCase();
      let type = 'other';
      let category = 'Natural Hazard';

      if (eventType === 'TC') {
        type = 'storm';
        category = 'Tropical Cyclone';
      } else if (eventType === 'FL') {
        type = 'flood';
        category = 'Flood';
      } else if (eventType === 'EQ') {
        type = 'earthquake';
        category = 'Earthquake';
      } else if (eventType === 'VO') {
        type = 'volcano';
        category = 'Volcano Eruption';
      } else if (eventType === 'WF') {
        type = 'fire';
        category = 'Wildfire';
      } else if (eventType === 'DR') {
        type = 'other';
        category = 'Drought';
      }

      const alertLevel = (p.alertlevel || '').toLowerCase();
      let severity = 'medium';
      if (alertLevel === 'red') severity = 'critical';
      else if (alertLevel === 'orange') severity = 'high';
      else if (alertLevel === 'green') severity = 'low';

      let magnitude = null;
      let unit = null;
      if (p.severitydata?.severity !== undefined && p.severitydata?.severity !== null) {
        magnitude = parseFloat(p.severitydata.severity);
        unit = p.severitydata.severityunit || '';
      }

      const country = p.country || '';
      const region = determineRegion(lat, lng, country);
      const title = p.name || p.eventname || p.htmldescription || `${category} Alert`;
      const reportUrl = p.url?.report || 'https://www.gdacs.org';

      normalized.push({
        id: `gdacs_${p.eventid || p.eventname}_${p.episodeid || 1}`,
        externalId: String(p.eventid || p.eventname),
        type,
        category,
        title,
        latitude: lat,
        longitude: lng,
        magnitude,
        unit,
        depth: null,
        severity,
        location: country || region,
        region,
        eventTime: new Date(eventTime).toISOString(),
        status: isCurrent ? 'Active Threat' : 'Alert Advisory',
        source: `GDACS (${p.source || 'JRC/UN'})`,
        sourceUrl: reportUrl,
        rawData: JSON.stringify(f)
      });
    }

    cache.sources.gdacs[timeframe] = normalized;
    cache.timestamps[`gdacs_${timeframe}`] = Date.now();
    return { data: normalized, status: 'ok' };
  } catch (err) {
    logger.warn(`[liveDisasterService] GDACS fetch error (${timeframe}): ${err.message}`);
    if (cache.sources.gdacs[timeframe]) {
      return { data: cache.sources.gdacs[timeframe], status: 'cached' };
    }
    return { data: [], status: 'failed', error: err.message };
  }
}

// ─── Spatial & Temporal Deduplication Engine ─────────────────────────────────
function deduplicateEvents(events) {
  const result = [];
  const PROXIMITY_THRESHOLD_KM = 60; // 60 km radius for duplicate reports
  const TIME_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours

  for (const candidate of events) {
    const candTime = new Date(candidate.eventTime).getTime();

    // Check if duplicate exists in result
    const existingIndex = result.findIndex(existing => {
      if (existing.type !== candidate.type) return false;
      const existTime = new Date(existing.eventTime).getTime();
      if (Math.abs(candTime - existTime) > TIME_THRESHOLD_MS) return false;

      const dist = haversineDistanceKm(
        existing.latitude,
        existing.longitude,
        candidate.latitude,
        candidate.longitude
      );
      return dist <= PROXIMITY_THRESHOLD_KM;
    });

    if (existingIndex === -1) {
      result.push(candidate);
    } else {
      // Merge best attributes
      const existing = result[existingIndex];
      // Prefer USGS for earthquakes because of precision
      if (candidate.source.includes('USGS') && !existing.source.includes('USGS')) {
        result[existingIndex] = { ...candidate, alternateSources: [existing.source] };
      }
      // Prefer GDACS/NASA for multi-hazard storms/floods with better naming
      else if (!existing.magnitude && candidate.magnitude) {
        existing.magnitude = candidate.magnitude;
        existing.unit = candidate.unit;
      }
    }
  }

  return result;
}

// ─── Main Aggregator ─────────────────────────────────────────────────────────
async function getLiveDisasterEvents(timeframe = '24h', filterType = 'all') {
  const now = Date.now();

  const [usgsRes, nasaRes, gdacsRes] = await Promise.allSettled([
    fetchUSGSEarthquakes(timeframe),
    fetchNASAEONET(timeframe),
    fetchGDACSEvents(timeframe)
  ]);

  const usgsResult = usgsRes.status === 'fulfilled' ? usgsRes.value : { data: [], status: 'failed' };
  const nasaResult = nasaRes.status === 'fulfilled' ? nasaRes.value : { data: [], status: 'failed' };
  const gdacsResult = gdacsRes.status === 'fulfilled' ? gdacsRes.value : { data: [], status: 'failed' };

  const sourceStatus = {
    usgs: usgsResult.status,
    eonet: nasaResult.status,
    gdacs: gdacsResult.status
  };

  const combined = [
    ...usgsResult.data,
    ...nasaResult.data,
    ...gdacsResult.data
  ];

  // Run spatial deduplication
  const deduplicated = deduplicateEvents(combined);

  // Sort descending by event time
  deduplicated.sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));

  const filtered = (filterType === 'all')
    ? deduplicated
    : deduplicated.filter(e => e.type === filterType);

  return {
    events: filtered,
    totalCount: filtered.length,
    allCount: deduplicated.length,
    timeframe,
    filterType,
    sourceStatus,
    lastUpdated: new Date(now).toISOString(),
    authoritativeSources: [
      { name: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/', status: sourceStatus.usgs },
      { name: 'NASA Earth Observatory (EONET v3)', url: 'https://eonet.gsfc.nasa.gov/', status: sourceStatus.eonet },
      { name: 'GDACS Global Disaster Alert System', url: 'https://www.gdacs.org/', status: sourceStatus.gdacs }
    ]
  };
}

module.exports = {
  getLiveDisasterEvents,
  fetchUSGSEarthquakes,
  fetchNASAEONET,
  fetchGDACSEvents,
  haversineDistanceKm,
  deduplicateEvents
};
