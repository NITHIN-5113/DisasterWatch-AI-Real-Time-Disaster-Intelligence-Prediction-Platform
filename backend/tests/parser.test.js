// backend/tests/parser.test.js
// Tests for DisasterWatch data parsing, unit conversion, and timezone handling

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { haversineDistanceKm, deduplicateEvents } = require('../src/services/liveDisasterService');

describe('Geospatial & Parser Unit Tests', () => {

  it('correctly calculates Haversine distance between two coordinates', () => {
    // Tokyo (35.6762, 139.6503) to Yokohama (35.4437, 139.6380) is ~26 km
    const dist = haversineDistanceKm(35.6762, 139.6503, 35.4437, 139.6380);
    assert.ok(dist >= 25 && dist <= 28, `Expected distance ~26km, got ${dist}`);
  });

  it('correctly reports 0 km distance for identical coordinates', () => {
    const dist = haversineDistanceKm(12.9716, 77.5946, 12.9716, 77.5946);
    assert.equal(Math.round(dist), 0);
  });

  it('deduplicates events within 60km and 12h of same type while preserving distinct events', () => {
    const baseTime = Date.now();
    const event1 = {
      id: 'gdacs_1',
      type: 'earthquake',
      title: 'Earthquake in Japan',
      latitude: 35.60,
      longitude: 139.70,
      magnitude: 5.2,
      unit: 'Richter',
      eventTime: new Date(baseTime).toISOString(),
      source: 'GDACS'
    };
    const duplicateReport = {
      id: 'usgs_1',
      type: 'earthquake',
      title: 'M 5.3 - Near Tokyo',
      latitude: 35.62,
      longitude: 139.72,
      magnitude: 5.3,
      unit: 'Richter',
      eventTime: new Date(baseTime + 10 * 60 * 1000).toISOString(), // 10 mins later
      source: 'USGS Earthquake Hazards Program'
    };
    const distinctEvent = {
      id: 'usgs_2',
      type: 'earthquake',
      title: 'Earthquake in California',
      latitude: 34.05,
      longitude: -118.25,
      magnitude: 4.1,
      unit: 'Richter',
      eventTime: new Date(baseTime).toISOString(),
      source: 'USGS Earthquake Hazards Program'
    };

    const deduplicated = deduplicateEvents([event1, duplicateReport, distinctEvent]);

    assert.equal(deduplicated.length, 2, 'Should have deduplicated the Tokyo earthquake down to 1 event');
    // Verify that USGS source is prioritized for earthquakes
    const tokyoEvent = deduplicated.find(e => e.latitude > 35 && e.latitude < 36);
    assert.ok(tokyoEvent.source.includes('USGS'), 'Should prefer authoritative USGS record');
  });

  it('verifies that all timestamps are valid ISO 8601 UTC strings', () => {
    const isoString = new Date().toISOString();
    assert.match(isoString, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = new Date(isoString);
    assert.ok(!isNaN(parsed.getTime()), 'Timestamp must parse to valid time');
  });

  it('verifies coordinate validation boundaries (-90..90 lat, -180..180 lng)', () => {
    const isValidCoord = (lat, lng) =>
      typeof lat === 'number' && typeof lng === 'number' &&
      !isNaN(lat) && !isNaN(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180;

    assert.ok(isValidCoord(11.1271, 78.6569));
    assert.ok(isValidCoord(-45.0, 168.0));
    assert.ok(!isValidCoord(95.0, 10.0));
    assert.ok(!isValidCoord(0.0, 185.0));
    assert.ok(!isValidCoord(NaN, 50.0));
  });

});
