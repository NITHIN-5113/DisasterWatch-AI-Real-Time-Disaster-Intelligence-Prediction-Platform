// backend/src/services/weatherService.js
// DisasterWatch — Authoritative Weather Data Service via Open-Meteo (No API key needed)
// Provides current atmospheric telemetry and forecast indicators for weather map layers

'use strict';

const logger = require('../utils/logger');

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const pointCache = new Map();

async function fetchPointWeather(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    throw new Error('Valid numeric latitude and longitude required');
  }

  // Cache key rounded to 2 decimal places (~1.1 km resolution)
  const key = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const cached = pointCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation,surface_pressure,wind_speed_10m,wind_direction_10m,weather_code&hourly=temperature_2m,precipitation_probability,wind_speed_10m&forecast_days=2`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DisasterWatch/2.0 (weather-forecasting-service)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`Open-Meteo returned HTTP ${res.status}`);
    }

    const json = await res.json();
    const cur = json.current || {};
    const units = json.current_units || {};

    const data = {
      latitude: lat,
      longitude: lng,
      elevation: json.elevation,
      timezone: json.timezone || 'UTC',
      current: {
        time: cur.time ? new Date(cur.time).toISOString() : new Date().toISOString(),
        temperature: cur.temperature_2m,
        temperatureUnit: units.temperature_2m || '°C',
        relativeHumidity: cur.relative_humidity_2m,
        humidityUnit: units.relative_humidity_2m || '%',
        precipitation: cur.precipitation,
        precipitationUnit: units.precipitation || 'mm',
        surfacePressure: cur.surface_pressure,
        pressureUnit: units.surface_pressure || 'hPa',
        windSpeed: cur.wind_speed_10m,
        windSpeedUnit: units.wind_speed_10m || 'km/h',
        windDirection: cur.wind_direction_10m,
        windDirectionUnit: units.wind_direction_10m || '°',
        weatherCode: cur.weather_code
      },
      hourly: {
        time: (json.hourly?.time || []).slice(0, 24).map(t => new Date(t).toISOString()),
        temperature: (json.hourly?.temperature_2m || []).slice(0, 24),
        precipitationProb: (json.hourly?.precipitation_probability || []).slice(0, 24),
        windSpeed: (json.hourly?.wind_speed_10m || []).slice(0, 24)
      },
      source: 'Open-Meteo Global Weather Model (ECMWF/GFS)',
      sourceUrl: 'https://open-meteo.com/',
      fetchedAt: new Date().toISOString()
    };

    pointCache.set(key, { data, timestamp: Date.now() });

    // Evict cache if too large
    if (pointCache.size > 200) {
      const oldestKey = pointCache.keys().next().value;
      pointCache.delete(oldestKey);
    }

    return data;
  } catch (err) {
    logger.warn(`[weatherService] Open-Meteo fetch error: ${err.message}`);
    if (cached) return cached.data;
    throw err;
  }
}

module.exports = {
  fetchPointWeather
};
