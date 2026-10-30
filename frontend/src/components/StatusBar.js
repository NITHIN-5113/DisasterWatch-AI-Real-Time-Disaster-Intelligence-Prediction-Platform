// frontend/src/components/StatusBar.js
// DisasterWatch — Bottom Telemetry, Cursor Coordinates & Attribution Footer

'use strict';

const StatusBar = (() => {
  let containerEl = null;

  function render(containerId = 'statusBarRoot') {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    containerEl.innerHTML = `
      <div class="dw-status-bar">
        <!-- Left: Live Cursor Coordinates & Zoom -->
        <div class="dw-sb-left">
          <span class="dw-sb-coords mono" id="sbCoordinates">0° 00' N  0° 00' E</span>
          <span class="dw-sb-zoom mono" id="sbZoom">4.0z</span>
        </div>

        <!-- Center: Authoritative Attribution Footer -->
        <div class="dw-sb-center">
          <span>&copy; DisasterWatch &bull; Satellite: NOAA/NESDIS/STAR, EUMETSAT, JMA &bull; USGS, NASA EONET, GDACS, RainViewer, Open-Meteo</span>
        </div>

        <!-- Right: Scale Bar Indicator -->
        <div class="dw-sb-right">
          <div class="dw-sb-scale">
            <span class="dw-sb-scale-line"></span>
            <span class="dw-sb-scale-label mono" id="sbScaleLabel">1000 km</span>
          </div>
        </div>
      </div>
    `;

    setupSubscriptions();
  }

  function setupSubscriptions() {
    DWState.on('change:cursorCoords', (coords) => {
      const el = document.getElementById('sbCoordinates');
      if (el && coords) {
        el.textContent = DWUtils.formatCoordinates(coords.lat, coords.lng, true);
      }
    });

    DWState.on('change:zoomLevel', (zoom) => {
      const el = document.getElementById('sbZoom');
      if (el && zoom !== undefined) {
        el.textContent = `${zoom.toFixed(1)}z`;
      }
      updateScale(zoom);
    });
  }

  function updateScale(zoom) {
    const scaleEl = document.getElementById('sbScaleLabel');
    if (!scaleEl) return;

    // Approximate scale label based on web mercator zoom at equator
    const scaleKmMap = {
      2: 2500,
      3: 2000,
      4: 1000,
      5: 500,
      6: 250,
      7: 100,
      8: 50,
      9: 25,
      10: 10,
      11: 5,
      12: 2,
      13: 1,
      14: 0.5
    };

    const km = scaleKmMap[Math.round(zoom)] || 100;
    const units = DWState.get('unitSystem') || 'METRIC';
    scaleEl.textContent = DWUtils.formatDistance(km, units);
  }

  return { render };
})();

window.StatusBar = StatusBar;
