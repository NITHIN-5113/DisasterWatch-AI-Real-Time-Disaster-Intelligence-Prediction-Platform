// frontend/src/state.js
// DisasterWatch — Central Reactive State Store & Event Bus

'use strict';

const DWState = (() => {
  const state = {
    // Base Layer: 'satellite' | 'streets' | 'hybrid' | 'terrain' | 'nasa-gibs'
    activeBaseLayer: 'satellite',
    satelliteMode: 'live', // 'live' | 'hd'

    // Weather Forecast Overlays: null | 'radar' | 'precipitation' | 'wind' | 'temperature' | 'humidity' | 'pressure'
    activeWeatherOverlay: null,

    // Hazard Filters
    hazardFilters: new Set(['earthquake', 'storm', 'fire', 'flood', 'volcano']),
    timeframe: '24h', // '24h' | '7d' | '30d'

    // Radar / Satellite Animation Timeline
    timeline: {
      frames: [],
      currentIndex: 0,
      isPlaying: false,
      speedMs: 1200
    },

    // Selected event for detail panel
    selectedEvent: null,

    // Coordinates of mouse cursor or map center
    cursorCoords: { lat: 0, lng: 0 },
    zoomLevel: 4,

    // User GPS location
    userLocation: null,

    // Measurement tool state
    isMeasuring: false,

    // Settings
    timeFormat: localStorage.getItem('dw_time_format') || 'UTC', // 'UTC' | 'LOCAL'
    unitSystem: localStorage.getItem('dw_unit_system') || 'METRIC', // 'METRIC' | 'IMPERIAL'

    // Data caches
    events: [],
    radarMetadata: null,
    weatherPoint: null,
    isLeftPanelOpen: true
  };

  const listeners = new Map();

  function on(eventName, callback) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }
    listeners.get(eventName).add(callback);
    return () => listeners.get(eventName).delete(callback);
  }

  function emit(eventName, payload) {
    if (listeners.has(eventName)) {
      listeners.get(eventName).forEach(cb => {
        try { cb(payload); } catch (e) { console.error(`Error in listener for ${eventName}:`, e); }
      });
    }
  }

  return {
    get(key) {
      return state[key];
    },

    set(key, value) {
      state[key] = value;
      emit(`change:${key}`, value);
      emit('change', { key, value });
    },

    getState() {
      return state;
    },

    on,
    emit,

    toggleHazard(type) {
      if (state.hazardFilters.has(type)) {
        state.hazardFilters.delete(type);
      } else {
        state.hazardFilters.add(type);
      }
      emit('change:hazardFilters', state.hazardFilters);
    },

    setTimeFormat(format) {
      state.timeFormat = format;
      localStorage.setItem('dw_time_format', format);
      emit('change:timeFormat', format);
    },

    setUnitSystem(units) {
      state.unitSystem = units;
      localStorage.setItem('dw_unit_system', units);
      emit('change:unitSystem', units);
    }
  };
})();

window.DWState = DWState;
