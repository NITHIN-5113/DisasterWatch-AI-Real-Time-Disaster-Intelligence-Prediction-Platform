// frontend/src/components/ControlsBar.js
// DisasterWatch — Floating Right-Hand Operations & Tools Stack

'use strict';

const ControlsBar = (() => {
  let rootEl = null;

  function render(containerId = 'controlsRoot') {
    rootEl = document.getElementById(containerId);
    if (!rootEl) return;

    const I = window.DWIcons;

    rootEl.innerHTML = `
      <div class="dw-controls-stack">
        <!-- Floating Search Trigger -->
        <button type="button" class="dw-ctrl-btn" id="btnCtrlSearch" title="Search city, district, country">
          ${I.get('search')}
        </button>

        <!-- Settings Modal Trigger -->
        <button type="button" class="dw-ctrl-btn" id="btnCtrlSettings" title="Settings (Units, UTC/Local Time)">
          ${I.get('settings')}
        </button>

        <!-- Information / Sources Modal Trigger -->
        <button type="button" class="dw-ctrl-btn" id="btnCtrlInfo" title="Authoritative Data Sources & Legend">
          ${I.get('info')}
        </button>

        <!-- Share / Export View -->
        <button type="button" class="dw-ctrl-btn" id="btnCtrlShare" title="Copy coordinate link or export data">
          ${I.get('share')}
        </button>

        <!-- Geodesic Measurement Tool -->
        <button type="button" class="dw-ctrl-btn" id="btnCtrlMeasure" title="Measure Distance Tool">
          ${I.get('measure')}
        </button>

        <!-- Locate Me GPS -->
        <button type="button" class="dw-ctrl-btn" id="btnCtrlLocate" title="Center to My GPS Location">
          ${I.get('locate')}
        </button>

        <div class="dw-ctrl-divider"></div>

        <!-- Zoom Controls -->
        <button type="button" class="dw-ctrl-btn" id="btnCtrlZoomIn" title="Zoom in">
          ${I.get('plus')}
        </button>
        <button type="button" class="dw-ctrl-btn" id="btnCtrlZoomOut" title="Zoom out">
          ${I.get('minus')}
        </button>
      </div>

      <!-- Floating Search Dropdown Container -->
      <div class="dw-search-popover hidden" id="dwSearchPopover">
        <div class="dw-sp-input-wrap">
          <span class="dw-sp-icon">${I.get('search')}</span>
          <input type="text" id="dwSearchInput" placeholder="Search city, region, or place..." autocomplete="off"/>
          <button type="button" class="dw-sp-clear" id="dwSearchClear">${I.get('close')}</button>
        </div>
        <div class="dw-sp-results" id="dwSearchResults"></div>
      </div>
    `;

    setupEvents();
  }

  function setupEvents() {
    // Zoom In / Out
    document.getElementById('btnCtrlZoomIn')?.addEventListener('click', () => window.MapView?.zoomIn());
    document.getElementById('btnCtrlZoomOut')?.addEventListener('click', () => window.MapView?.zoomOut());

    // Search Box Popover Toggle
    const searchBtn = document.getElementById('btnCtrlSearch');
    const searchPop = document.getElementById('dwSearchPopover');
    const searchInput = document.getElementById('dwSearchInput');

    searchBtn?.addEventListener('click', () => {
      searchPop.classList.toggle('hidden');
      if (!searchPop.classList.contains('hidden')) {
        searchInput.focus();
      }
    });

    document.getElementById('dwSearchClear')?.addEventListener('click', () => {
      searchInput.value = '';
      document.getElementById('dwSearchResults').innerHTML = '';
      searchPop.classList.add('hidden');
    });

    // Nominatim Geocoding with Debounce
    const handleSearch = DWUtils.debounce(async (query) => {
      if (!query || query.trim().length < 2) {
        document.getElementById('dwSearchResults').innerHTML = '';
        return;
      }

      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=5`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return;
        const results = await res.json();

        const resultsEl = document.getElementById('dwSearchResults');
        if (!results || results.length === 0) {
          resultsEl.innerHTML = `<div class="dw-sp-empty">No results found for "${query}"</div>`;
          return;
        }

        resultsEl.innerHTML = results.map(r => `
          <div class="dw-sp-item" data-lat="${r.lat}" data-lon="${r.lon}">
            <div class="dw-sp-item-title">${r.display_name.split(',')[0]}</div>
            <div class="dw-sp-item-sub">${r.display_name}</div>
          </div>
        `).join('');

        resultsEl.querySelectorAll('.dw-sp-item').forEach(item => {
          item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat);
            const lon = parseFloat(item.dataset.lon);
            window.MapView?.flyTo(lat, lon, 10);
            searchPop.classList.add('hidden');
          });
        });
      } catch (err) {
        console.warn('Geocoding search failed:', err);
      }
    }, 350);

    searchInput?.addEventListener('input', (e) => handleSearch(e.target.value));

    // Locate Me GPS
    document.getElementById('btnCtrlLocate')?.addEventListener('click', locateUser);

    // Measure Distance Tool Toggle
    document.getElementById('btnCtrlMeasure')?.addEventListener('click', () => {
      const isMeasuring = !DWState.get('isMeasuring');
      DWState.set('isMeasuring', isMeasuring);
      const btn = document.getElementById('btnCtrlMeasure');
      btn.classList.toggle('active', isMeasuring);
      if (isMeasuring) {
        DWUtils.showToast('Measurement tool active. Click two or more points on the map to measure geodesic distance.', 'info');
      } else {
        window.MapView?.clearMeasurement();
        DWUtils.showToast('Measurement cleared.', 'info');
      }
    });

    // Share / Copy Link
    document.getElementById('btnCtrlShare')?.addEventListener('click', () => {
      const coords = DWState.get('cursorCoords');
      const zoom = DWState.get('zoomLevel');
      const shareUrl = `${window.location.origin}${window.location.pathname}#view=${coords.lat.toFixed(4)},${coords.lng.toFixed(4)},${zoom}z`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          DWUtils.showToast('Operations map coordinate link copied to clipboard!', 'success');
        });
      } else {
        DWUtils.showToast(shareUrl, 'info');
      }
    });

    // Settings Modal
    document.getElementById('btnCtrlSettings')?.addEventListener('click', () => {
      window.SettingsModal?.open();
    });

    // Info Modal
    document.getElementById('btnCtrlInfo')?.addEventListener('click', () => {
      window.SettingsModal?.openInfo();
    });
  }

  function locateUser() {
    if (!navigator.geolocation) {
      DWUtils.showToast('Geolocation is not supported by your browser.', 'warning');
      return;
    }

    const btn = document.getElementById('btnCtrlLocate');
    btn?.classList.add('loading');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn?.classList.remove('loading');
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);

        DWState.set('userLocation', { lat, lng, accuracy });
        window.MapView?.flyTo(lat, lng, 12);
        DWUtils.showToast(`GPS Position verified: ±${accuracy}m accuracy`, 'success');
      },
      (err) => {
        btn?.classList.remove('loading');
        console.warn('Geolocation error:', err);
        DWUtils.showToast('Unable to acquire verified GPS position. Please verify browser location permissions.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  return { render };
})();

window.ControlsBar = ControlsBar;
