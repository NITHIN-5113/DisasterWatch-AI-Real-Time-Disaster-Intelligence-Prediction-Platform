// frontend/src/utils.js
// DisasterWatch — High-Precision Formatting, Geodesics & Conversion Helpers

'use strict';

const DWUtils = (() => {

  // ─── Format Lat/Lng to Degree-Minutes or Signed Decimal ─────────────────────
  function formatCoordinates(lat, lng, useDMS = false) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return '—';
    }

    if (!useDMS) {
      const latDir = lat >= 0 ? 'N' : 'S';
      const lngDir = lng >= 0 ? 'E' : 'W';
      return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
    }

    // DMS Format (matches Zoom.earth screenshot e.g. 11° 21' S  66° 14' E)
    function toDMS(val, posChar, negChar) {
      const dir = val >= 0 ? posChar : negChar;
      const absVal = Math.abs(val);
      const deg = Math.floor(absVal);
      const min = Math.floor((absVal - deg) * 60);
      return `${deg}° ${String(min).padStart(2, '0')}' ${dir}`;
    }

    return `${toDMS(lat, 'N', 'S')}  ${toDMS(lng, 'E', 'W')}`;
  }

  // ─── Format Timestamp (UTC vs Local) ────────────────────────────────────────
  function formatTimestamp(isoString, formatPreference = 'UTC', includeSeconds = false) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    if (formatPreference === 'UTC') {
      const day = date.getUTCDate();
      const month = months[date.getUTCMonth()];
      const year = date.getUTCFullYear();
      const hrs = String(date.getUTCHours()).padStart(2, '0');
      const mins = String(date.getUTCMinutes()).padStart(2, '0');
      const secs = includeSeconds ? `:${String(date.getUTCSeconds()).padStart(2, '0')}` : '';
      return `${day} ${month} ${year}, ${hrs}:${mins}${secs} UTC`;
    }

    // Local Device Time
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = includeSeconds ? `:${String(date.getSeconds()).padStart(2, '0')}` : '';
    return `${day} ${month} ${year}, ${hrs}:${mins}${secs} Local`;
  }

  // ─── Unit Conversions ───────────────────────────────────────────────────────
  function formatTemperature(degC, unitSystem = 'METRIC') {
    if (degC === null || degC === undefined || isNaN(degC)) return '—';
    if (unitSystem === 'IMPERIAL') {
      const f = (degC * 9 / 5) + 32;
      return `${f.toFixed(1)} °F`;
    }
    return `${degC.toFixed(1)} °C`;
  }

  function formatSpeed(kmh, unitSystem = 'METRIC', preferredUnit = 'km/h') {
    if (kmh === null || kmh === undefined || isNaN(kmh)) return '—';
    if (preferredUnit === 'knots' || unitSystem === 'IMPERIAL') {
      if (preferredUnit === 'knots') {
        const knots = kmh * 0.539957;
        return `${knots.toFixed(1)} kt`;
      }
      const mph = kmh * 0.621371;
      return `${mph.toFixed(1)} mph`;
    }
    return `${kmh.toFixed(1)} km/h`;
  }

  function formatPressure(hpa, unitSystem = 'METRIC') {
    if (hpa === null || hpa === undefined || isNaN(hpa)) return '—';
    if (unitSystem === 'IMPERIAL') {
      const inhg = hpa * 0.02953;
      return `${inhg.toFixed(2)} inHg`;
    }
    return `${hpa.toFixed(0)} hPa`;
  }

  function formatDistance(km, unitSystem = 'METRIC') {
    if (km === null || km === undefined || isNaN(km)) return '—';
    if (unitSystem === 'IMPERIAL') {
      const mi = km * 0.621371;
      return `${mi >= 10 ? Math.round(mi) : mi.toFixed(1)} mi`;
    }
    return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`;
  }

  // ─── Geodesic Haversine Distance (Kilometres) ───────────────────────────────
  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
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

  // ─── Debounce Helper ────────────────────────────────────────────────────────
  function debounce(fn, waitMs = 300) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), waitMs);
    };
  }

  // ─── Toast Notifications ───────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `dw-toast dw-toast-${type}`;
    toast.innerHTML = `
      <span class="dw-toast-icon">${window.DWIcons ? DWIcons.get(type === 'error' ? 'alert' : 'info') : ''}</span>
      <span class="dw-toast-text">${message}</span>
      <button class="dw-toast-close" type="button">${window.DWIcons ? DWIcons.get('close') : '✕'}</button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const timer = setTimeout(() => removeToast(toast), 4500);

    toast.querySelector('.dw-toast-close')?.addEventListener('click', () => {
      clearTimeout(timer);
      removeToast(toast);
    });
  }

  function removeToast(toast) {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 250);
  }

  return {
    formatCoordinates,
    formatTimestamp,
    formatTemperature,
    formatSpeed,
    formatPressure,
    formatDistance,
    calculateDistanceKm,
    debounce,
    showToast
  };
})();

window.DWUtils = DWUtils;
