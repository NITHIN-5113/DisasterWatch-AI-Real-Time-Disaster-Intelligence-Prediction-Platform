// backend/src/services/radarService.js
// DisasterWatch — Radar Frames Service for Timeline Animation
// Connects to RainViewer API to provide time-series radar frames (past observed + nowcast)

'use strict';

const logger = require('../utils/logger');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedData = null;
let lastFetchTime = 0;

async function fetchWithRetry(url, options = {}, retries = 1, backoffMs = 500) {
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

async function getRadarFrames() {
  const now = Date.now();
  if (cachedData && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedData;
  }

  try {
    const res = await fetchWithRetry('https://api.rainviewer.com/public/weather-maps.json', {
      headers: {
        'User-Agent': 'DisasterWatch/2.0 (operations-command-center)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(12000)
    }, 1);

    const json = await res.json();
    const host = json.host || 'https://tilecache.rainviewer.com';
    const past = json.radar?.past || [];
    const nowcast = json.radar?.nowcast || [];

    const allRaw = [
      ...past.map(p => ({ ...p, isPast: true })),
      ...nowcast.map(n => ({ ...n, isPast: false }))
    ];

    if (allRaw.length === 0) {
      throw new Error('No radar frames returned by RainViewer');
    }

    const frames = allRaw.map(f => {
      const date = new Date(f.time * 1000);
      const hoursUtc = String(date.getUTCHours()).padStart(2, '0');
      const minsUtc = String(date.getUTCMinutes()).padStart(2, '0');
      const day = date.getUTCDate();
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthStr = months[date.getUTCMonth()];

      return {
        time: f.time,
        timeISO: date.toISOString(),
        timeLabelUTC: `${hoursUtc}:${minsUtc} UTC`,
        dateLabelUTC: `${day} ${monthStr}`,
        tileUrl: `${host}/v2/radar/${f.time}/256/{z}/{x}/{y}/2/1_1.png`,
        isPast: f.isPast
      };
    });

    const latestPastIndex = past.length > 0 ? past.length - 1 : 0;

    const result = {
      host,
      frames,
      currentFrameIndex: latestPastIndex,
      totalFrames: frames.length,
      pastCount: past.length,
      nowcastCount: nowcast.length,
      source: 'RainViewer Real-Time Radar Network',
      sourceUrl: 'https://www.rainviewer.com/api.html',
      lastUpdated: new Date(now).toISOString()
    };

    cachedData = result;
    lastFetchTime = now;
    return result;
  } catch (err) {
    logger.warn(`[radarService] Failed to fetch RainViewer radar: ${err.message}`);
    if (cachedData) return cachedData;
    throw err;
  }
}

module.exports = {
  getRadarFrames
};
