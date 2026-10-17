// backend/src/services/liveDisasterService.js
// DisasterWatch — Authoritative Live Disaster & Observed Weather Service
// Fetches ONLY verified, observed events from official sources:
// 1. USGS Earthquake Hazards Program (Earthquakes)
// 2. NASA EONET v3 (Severe Storms, Wildfires, Volcanoes, Floods)
// 3. GDACS Global Disaster Alert and Coordination System
// 4. RainViewer API (Past Observed Radar Precipitation)
// NO simulated, mock, or predicted data.

'use strict';

const logger = require('../utils/logger');

// Cache configuration (5 minutes in-memory cache to avoid rate limits)
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = {
  sources: {
    usgs: {},
    nasa: {},
    gdacs: {}
  },
  timestamps: {},
  radar: null,
  radarTimestamp: 0
};

// ─── Simple Country & Continent Lookup via Coordinates ───────────────────────
function estimateRegion(lat, lng) {
  if (lat >= 6 && lat <= 36 && lng >= 68 && lng <= 98) {
    if (lat >= 8 && lat <= 13.6 && lng >= 76 && lng <= 80.5) {
      return { country: 'India (Tamil Nadu)', continent: 'Asia' };
    }
    return { country: 'India', continent: 'Asia' };
  }
  if (lat >= 20 && lat <= 50 && lng >= 120 && lng <= 150) {
    return { country: 'Japan', continent: 'Asia' };
  }
  if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) {
    return { country: 'United States', continent: 'North America' };
  }
  if (lat >= -55 && lat <= 15 && lng >= -85 && lng <= -35) {
    return { country: 'South America Region', continent: 'South America' };
  }
  if (lat >= 35 && lat <= 72 && lng >= -25 && lng <= 45) {
    return { country: 'Europe Region', continent: 'Europe' };
  }
  if (lat >= -35 && lat <= 38 && lng >= -18 && lng <= 52) {
    return { country: 'Africa Region', continent: 'Africa' };
  }
  if (lat >= -45 && lat <= -10 && lng >= 110 && lng <= 155) {
    return { country: 'Australia', continent: 'Oceania' };
  }
  if (lat >= -10 && lat <= 20 && lng >= 95 && lng <= 140) {
    return { country: 'Southeast Asia', continent: 'Asia' };
  }
  return { country: 'Global Waters / Territory', continent: 'Global' };
}

// ─── Fetch with Retry & Backoff Helper ────────────────────────────────────────
async function fetchWithRetry(url, options = {}, retries = 1, backoffMs = 400) {
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

// ─── 1. USGS Earthquakes Feed ────────────────────────────────────────────────
async function fetchUSGSEarthquakes(timeframe = '24h') {
  const feeds = {
    '24h': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    '7d':  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
    '30d': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson'
  };
  const url = feeds[timeframe] || feeds['24h'];

  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'DisasterWatch/1.0 (disaster-monitoring-platform)' },
      signal: AbortSignal.timeout(18000)
    }, 1);

    const data = await res.json();
    const features = data.features || [];

    const parsed = features.map((f) => {
      // GeoJSON standard: [longitude, latitude, depth]
      const coords = f.geometry?.coordinates || [0, 0, 0];
      const lng = coords[0];
      const lat = coords[1];
      const depth = coords[2];
      const mag = f.properties?.mag;
      const timeMs = f.properties?.time;
      const place = f.properties?.place || 'Unknown Location';
      const region = estimateRegion(lat, lng);

      let severity = 'low';
      if (mag >= 6.5) severity = 'critical';
      else if (mag >= 5.0) severity = 'high';
      else if (mag >= 4.0) severity = 'medium';

      return {
        id: `usgs_${f.id}`,
        title: f.properties?.title || `M ${mag} Earthquake - ${place}`,
        type: 'earthquake',
        category: 'Earthquake',
        severity,
        lat,
        lng,
        depth: depth !== null && depth !== undefined ? `${depth.toFixed(1)} km` : null,
        magnitude: mag !== null && mag !== undefined ? parseFloat(mag.toFixed(1)) : null,
        location: place,
        country: region.country,
        continent: region.continent,
        time: timeMs ? new Date(timeMs).toISOString() : new Date().toISOString(),
        status: f.properties?.status ? `Confirmed (${f.properties.status})` : 'Confirmed',
        source: 'USGS Earthquake Hazards Program',
        sourceUrl: f.properties?.url || 'https://earthquake.usgs.gov/',
        observed: true,
      };
    });

    // Cache successful response
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

// ─── 2. NASA EONET v3 (Severe Storms, Wildfires, Volcanoes, Floods) ───────────
async function fetchNASAEONET(timeframe = '24h') {
  const daysMap = { '24h': 2, '7d': 7, '30d': 30 };
  const days = daysMap[timeframe] || 7;
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=${days}`;

  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'DisasterWatch/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000)
    }, 1);

    const data = await res.json();
    const events = data.events || [];
    const normalized = [];

    for (const ev of events) {
      const catId = ev.categories?.[0]?.id;
      let type = 'other';
      let category = ev.categories?.[0]?.title || 'Natural Event';

      if (catId === 'wildfires') {
        type = 'fire';
        category = 'Wildfire';
      } else if (catId === 'severeStorms') {
        type = 'storm';
        category = 'Severe Storm / Cyclone';
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
      const coords = latestGeo.coordinates;
      if (!coords || !Array.isArray(coords)) continue;

      let lng, lat;
      if (typeof coords[0] === 'number') {
        lng = coords[0];
        lat = coords[1];
      } else if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
        lng = coords[0][0];
        lat = coords[0][1];
      } else if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
        lng = coords[0][0][0];
        lat = coords[0][0][1];
      }

      if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) continue;

      const sourceObj = ev.sources?.[0] || {};
      const sourceUrl = sourceObj.url || 'https://eonet.gsfc.nasa.gov/';
      const sourceName = sourceObj.id ? `NASA EONET (${sourceObj.id.toUpperCase()})` : 'NASA Earth Observatory (EONET)';
      const region = estimateRegion(lat, lng);

      normalized.push({
        id: `nasa_${ev.id}`,
        title: ev.title || `${category} Event`,
        type,
        category,
        severity: type === 'fire' || type === 'storm' ? 'high' : 'medium',
        lat,
        lng,
        location: ev.title,
        country: region.country,
        continent: region.continent,
        time: latestGeo.date ? new Date(latestGeo.date).toISOString() : new Date().toISOString(),
        status: 'Active / Observed',
        source: sourceName,
        sourceUrl,
        observed: true,
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
        'User-Agent': 'DisasterWatch/1.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(18000)
    }, 1);

    const json = await res.json();
    const features = json.features || [];
    const normalized = [];

    // Filter by timeframe
    const now = Date.now();
    const timeLimits = {
      '24h': 24 * 60 * 60 * 1000,
      '7d':  7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    const maxAge = timeLimits[timeframe] || timeLimits['24h'];

    for (const f of features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!coords || !Array.isArray(coords)) continue;

      // GeoJSON [longitude, latitude]
      const lng = coords[0];
      const lat = coords[1];
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) continue;

      // Filter by event date
      const dateStr = p.datemodified || p.todate || p.fromdate;
      const eventTime = dateStr ? new Date(dateStr).getTime() : now;
      if (now - eventTime > maxAge && timeframe !== '30d') continue;

      const eventType = (p.eventtype || '').toUpperCase();
      let type = 'other';
      let category = 'Natural Event';

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

      // Map GDACS alert levels
      const alertLevel = (p.alertlevel || '').toLowerCase();
      let severity = 'medium';
      if (alertLevel === 'red') severity = 'critical';
      else if (alertLevel === 'orange') severity = 'high';
      else if (alertLevel === 'green') severity = 'low';

      const region = estimateRegion(lat, lng);
      const title = p.name || p.eventname || p.htmldescription || `${category} Alert`;
      const reportUrl = p.url?.report || 'https://www.gdacs.org';

      normalized.push({
        id: `gdacs_${p.eventid || p.eventname}_${p.episodeid || 1}`,
        title,
        type,
        category,
        severity,
        lat,
        lng,
        location: p.country || region.country,
        country: p.country || region.country,
        continent: region.continent,
        time: new Date(eventTime).toISOString(),
        status: p.iscurrent === 'true' || p.iscurrent === true ? 'Active' : 'Confirmed Alert',
        source: `GDACS (${p.source || 'JRC'})`,
        sourceUrl: reportUrl,
        observed: true,
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

// ─── 4. RainViewer Past Radar Metadata ────────────────────────────────────────
async function fetchRainViewerRadar() {
  const now = Date.now();
  if (cache.radar && (now - cache.radarTimestamp < CACHE_TTL_MS)) {
    return cache.radar;
  }

  try {
    const res = await fetchWithRetry('https://api.rainviewer.com/public/weather-maps.json', {
      headers: { 'User-Agent': 'DisasterWatch/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000)
    }, 1);

    const data = await res.json();
    const host = data.host || 'https://tilecache.rainviewer.com';
    const past = data.radar?.past || [];
    const latest = past.length > 0 ? past[past.length - 1] : null;

    if (!latest) throw new Error('No observed radar frames available');

    const result = {
      host,
      timestamp: latest.time,
      observationTime: new Date(latest.time * 1000).toISOString(),
      tileUrlTemplate: `${host}/v2/radar/${latest.time}/256/{z}/{x}/{y}/2/1_1.png`,
      timeWindowLabel: `Observed radar as of ${new Date(latest.time * 1000).toUTCString().slice(17, 22)} UTC`,
      source: 'RainViewer Real-Time Radar Network',
      sourceUrl: 'https://www.rainviewer.com/api.html',
      isObserved: true
    };

    cache.radar = result;
    cache.radarTimestamp = now;
    return result;
  } catch (err) {
    logger.warn(`[liveDisasterService] RainViewer fetch error: ${err.message}`);
    if (cache.radar) return cache.radar;
    return null;
  }
}

// ─── Main Aggregator Function ────────────────────────────────────────────────
async function getLiveDisasterEvents(timeframe = '24h', filterType = 'all') {
  const now = Date.now();

  // Execute in parallel with Promise.allSettled
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

  // Deduplicate by geographical proximity and event type if same event reported across GDACS/USGS
  const eventMap = new Map();

  const addEvent = (ev) => {
    // Round lat/lng to 1 decimal place to deduplicate identical events reported by both USGS & GDACS
    const key = `${ev.type}_${ev.lat.toFixed(1)}_${ev.lng.toFixed(1)}`;
    if (!eventMap.has(key)) {
      eventMap.set(key, ev);
    }
  };

  usgsResult.data.forEach(addEvent);
  nasaResult.data.forEach(addEvent);
  gdacsResult.data.forEach(addEvent);

  const allEvents = Array.from(eventMap.values());

  // Sort descending by event time
  allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

  // Apply filter if specified
  const filtered = (filterType === 'all')
    ? allEvents
    : allEvents.filter(e => e.type === filterType);

  return {
    events: filtered,
    totalCount: filtered.length,
    allCount: allEvents.length,
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

// ─── Global Summary Aggregator ──────────────────────────────────────────────
async function getGlobalDisasterSummary(timeframe = '24h') {
  const { events, lastUpdated, sourceStatus } = await getLiveDisasterEvents(timeframe, 'all');

  const continentCounts = {};
  const countryCounts = {};
  const typeCounts = {};

  for (const ev of events) {
    const continent = ev.continent || 'Other';
    continentCounts[continent] = (continentCounts[continent] || 0) + 1;

    const country = ev.country || 'Global Waters';
    if (!countryCounts[country]) {
      countryCounts[country] = { count: 0, continent, types: {}, sampleCoords: [ev.lat, ev.lng] };
    }
    countryCounts[country].count++;
    countryCounts[country].types[ev.category] = (countryCounts[country].types[ev.category] || 0) + 1;

    typeCounts[ev.category] = (typeCounts[ev.category] || 0) + 1;
  }

  const sortedCountries = Object.entries(countryCounts)
    .map(([country, data]) => ({ country, ...data }))
    .sort((a, b) => b.count - a.count);

  const sortedContinents = Object.entries(continentCounts)
    .map(([continent, count]) => ({ continent, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalActiveDisasters: events.length,
    timeframe,
    lastUpdated,
    sourceStatus,
    byContinent: sortedContinents,
    byCountry: sortedCountries,
    byType: typeCounts
  };
}

module.exports = {
  getLiveDisasterEvents,
  getGlobalDisasterSummary,
  fetchRainViewerRadar
};
