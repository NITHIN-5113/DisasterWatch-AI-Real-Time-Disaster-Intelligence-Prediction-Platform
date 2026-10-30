// frontend/src/components/EventDetailPanel.js
// DisasterWatch — Slide-Over Floating Disaster Threat Inspector Card

'use strict';

const EventDetailPanel = (() => {
  let containerEl = null;

  function render(containerId = 'eventDetailRoot') {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    DWState.on('change:selectedEvent', (ev) => {
      if (!ev) {
        containerEl.innerHTML = '';
        containerEl.classList.add('hidden');
        return;
      }
      showEvent(ev);
    });
  }

  function showEvent(ev) {
    if (!containerEl) return;

    const I = window.DWIcons;
    const units = DWState.get('unitSystem') || 'METRIC';
    const timePref = DWState.get('timeFormat') || 'UTC';
    const sev = (ev.severity || 'medium').toLowerCase();

    // Icon mapping
    const iconSvg = I.get(ev.type) || I.get('alert');

    // Distance calculation from user if available
    let userDistStr = '—';
    const userLoc = DWState.get('userLocation');
    if (userLoc && typeof ev.latitude === 'number' && typeof ev.longitude === 'number') {
      const d = DWUtils.calculateDistanceKm(userLoc.lat, userLoc.lng, ev.latitude, ev.longitude);
      userDistStr = DWUtils.formatDistance(d, units);
    }

    // Magnitude & units display
    let magDisplay = '—';
    if (ev.magnitude !== null && ev.magnitude !== undefined) {
      if (ev.type === 'earthquake') {
        magDisplay = `M ${ev.magnitude} ${ev.unit || 'Richter'}`;
      } else if (ev.type === 'storm') {
        magDisplay = `${ev.magnitude} ${ev.unit || 'kt'}`;
      } else {
        magDisplay = `${ev.magnitude} ${ev.unit || ''}`;
      }
    }

    const depthStr = ev.depth !== null && ev.depth !== undefined
      ? DWUtils.formatDistance(ev.depth, units)
      : '—';

    const timeUtc = DWUtils.formatTimestamp(ev.eventTime, 'UTC');
    const timeLocal = DWUtils.formatTimestamp(ev.eventTime, 'LOCAL');

    containerEl.innerHTML = `
      <div class="dw-detail-card sev-border-${sev}">
        <!-- Header -->
        <div class="dw-dc-header">
          <div class="dw-dc-type-wrap">
            <span class="dw-dc-type-icon">${iconSvg}</span>
            <span class="dw-dc-type-name">${(ev.category || ev.type).toUpperCase()}</span>
          </div>
          <div class="dw-dc-header-right">
            <span class="dw-dc-sev-badge sev-${sev}">${sev.toUpperCase()}</span>
            <button type="button" class="dw-dc-close" id="btnDetailClose">${I.get('close')}</button>
          </div>
        </div>

        <!-- Title -->
        <div class="dw-dc-title">${ev.title || 'Disaster Threat Alert'}</div>
        <div class="dw-dc-location">${ev.location || 'Reported Coordinates'}</div>

        <!-- Telemetry Grid -->
        <div class="dw-dc-grid">
          <div class="dw-dc-stat">
            <span class="dw-dc-stat-label">MAGNITUDE / INTENSITY</span>
            <span class="dw-dc-stat-val bold">${magDisplay}</span>
          </div>
          <div class="dw-dc-stat">
            <span class="dw-dc-stat-label">DEPTH / ELEVATION</span>
            <span class="dw-dc-stat-val">${depthStr}</span>
          </div>
          <div class="dw-dc-stat">
            <span class="dw-dc-stat-label">COORDINATES</span>
            <span class="dw-dc-stat-val mono">${DWUtils.formatCoordinates(ev.latitude, ev.longitude)}</span>
          </div>
          <div class="dw-dc-stat">
            <span class="dw-dc-stat-label">DISTANCE FROM YOU</span>
            <span class="dw-dc-stat-val">${userDistStr}</span>
          </div>
        </div>

        <!-- Timestamps -->
        <div class="dw-dc-timestamps">
          <div class="dw-dc-time-row">
            <span class="dw-dc-time-label">UTC Time:</span>
            <span class="dw-dc-time-val mono">${timeUtc}</span>
          </div>
          <div class="dw-dc-time-row">
            <span class="dw-dc-time-label">Local Time:</span>
            <span class="dw-dc-time-val mono">${timeLocal}</span>
          </div>
        </div>

        <!-- Source Attribution Link -->
        <div class="dw-dc-source-row">
          <span class="dw-dc-source-label">Official Source:</span>
          <a href="${ev.sourceUrl || '#'}" target="_blank" rel="noopener noreferrer" class="dw-dc-source-link">
            <span>${ev.source || 'Official Feed'}</span>
            <span class="dw-dc-ext-icon">${I.get('externalLink')}</span>
          </a>
        </div>

        <!-- Action Bar -->
        <div class="dw-dc-actions">
          <button type="button" class="dw-dc-btn" id="btnDetailCenter">
            ${I.get('locate')}
            <span>Center on Map</span>
          </button>
          <button type="button" class="dw-dc-btn" id="btnDetailExport">
            ${I.get('share')}
            <span>Export JSON</span>
          </button>
        </div>
      </div>
    `;

    containerEl.classList.remove('hidden');

    document.getElementById('btnDetailClose')?.addEventListener('click', () => {
      DWState.set('selectedEvent', null);
    });

    document.getElementById('btnDetailCenter')?.addEventListener('click', () => {
      window.MapView?.flyTo(ev.latitude, ev.longitude, 8);
    });

    document.getElementById('btnDetailExport')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(ev, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-${ev.id || 'disaster'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      DWUtils.showToast('Event telemetry exported', 'success');
    });
  }

  return { render };
})();

window.EventDetailPanel = EventDetailPanel;
