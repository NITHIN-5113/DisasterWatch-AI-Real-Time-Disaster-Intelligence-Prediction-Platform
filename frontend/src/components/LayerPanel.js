// frontend/src/components/LayerPanel.js
// DisasterWatch — Slim Floating Left Layer Control Panel (Zoom.earth layout)

'use strict';

const LayerPanel = (() => {
  let panelEl = null;

  function render(containerId = 'layerPanelRoot') {
    panelEl = document.getElementById(containerId);
    if (!panelEl) return;

    const I = window.DWIcons;

    panelEl.innerHTML = `
      <div class="dw-layer-panel" id="dwLayerPanel">
        <!-- Brand Header -->
        <div class="dw-lp-brand">
          <div class="dw-lp-brand-left">
            <span class="dw-lp-logo">${I.get('radarLogo')}</span>
            <div class="dw-lp-title-group">
              <span class="dw-lp-title">DISASTERWATCH</span>
              <span class="dw-lp-sub">COMMAND CENTER</span>
            </div>
          </div>
          <button type="button" class="dw-lp-collapse-btn" id="btnTogglePanel" title="Toggle panel">
            ${I.get('chevronLeft')}
          </button>
        </div>

        <div class="dw-lp-scroll">
          <!-- ─── LIVE MAPS ─── -->
          <div class="dw-lp-group">
            <div class="dw-lp-group-header">
              <span>LIVE MAPS</span>
              <span class="dw-lp-group-caret">${I.get('chevronDown')}</span>
            </div>
            <div class="dw-lp-group-content">
              <!-- Satellite Main Button -->
              <button type="button" class="dw-lp-item active" id="btnLayerSatellite" data-layer="satellite">
                <span class="dw-lp-item-icon">${I.get('satellite')}</span>
                <span class="dw-lp-item-label">Satellite</span>
              </button>
              <!-- Satellite Sub-options (Live, HD) -->
              <div class="dw-lp-sub-options">
                <button type="button" class="dw-lp-sub-btn active" id="btnSatLive">
                  <span class="dw-lp-check">${I.get('check')}</span>
                  <span>Live</span>
                </button>
                <button type="button" class="dw-lp-sub-btn" id="btnSatHD">
                  <span class="dw-lp-check invisible">${I.get('check')}</span>
                  <span>HD</span>
                </button>
              </div>

              <!-- Radar Main Button -->
              <button type="button" class="dw-lp-item" id="btnLayerRadar" data-layer="radar">
                <span class="dw-lp-item-icon">${I.get('radar')}</span>
                <span class="dw-lp-item-label">Radar</span>
              </button>
            </div>
          </div>

          <!-- ─── FORECAST MAPS ─── -->
          <div class="dw-lp-group">
            <div class="dw-lp-group-header">
              <span>FORECAST MAPS</span>
              <span class="dw-lp-group-caret">${I.get('chevronDown')}</span>
            </div>
            <div class="dw-lp-group-content">
              <button type="button" class="dw-lp-item" data-overlay="precipitation">
                <span class="dw-lp-item-icon">${I.get('precipitation')}</span>
                <span class="dw-lp-item-label">Precipitation</span>
              </button>
              <button type="button" class="dw-lp-item" data-overlay="wind">
                <span class="dw-lp-item-icon">${I.get('wind')}</span>
                <span class="dw-lp-item-label">Wind</span>
              </button>
              <button type="button" class="dw-lp-item" data-overlay="temperature">
                <span class="dw-lp-item-icon">${I.get('temperature')}</span>
                <span class="dw-lp-item-label">Temperature</span>
              </button>
              <button type="button" class="dw-lp-item" data-overlay="humidity">
                <span class="dw-lp-item-icon">${I.get('humidity')}</span>
                <span class="dw-lp-item-label">Humidity</span>
              </button>
              <button type="button" class="dw-lp-item" data-overlay="pressure">
                <span class="dw-lp-item-icon">${I.get('pressure')}</span>
                <span class="dw-lp-item-label">Pressure</span>
              </button>
            </div>
          </div>

          <!-- ─── HAZARDS & THREATS ─── -->
          <div class="dw-lp-group">
            <div class="dw-lp-group-header">
              <span>HAZARDS & THREATS</span>
              <span class="dw-lp-group-caret">${I.get('chevronDown')}</span>
            </div>
            <div class="dw-lp-group-content">
              <button type="button" class="dw-lp-hazard-item active" data-hazard="earthquake">
                <div class="dw-lp-hi-left">
                  <span class="dw-lp-hazard-dot quake"></span>
                  <span class="dw-lp-hi-icon">${I.get('earthquake')}</span>
                  <span>Earthquakes</span>
                </div>
                <span class="dw-lp-badge" id="countQuakes">0</span>
              </button>
              <button type="button" class="dw-lp-hazard-item active" data-hazard="storm">
                <div class="dw-lp-hi-left">
                  <span class="dw-lp-hazard-dot storm"></span>
                  <span class="dw-lp-hi-icon">${I.get('storm')}</span>
                  <span>Cyclones / Storms</span>
                </div>
                <span class="dw-lp-badge" id="countStorms">0</span>
              </button>
              <button type="button" class="dw-lp-hazard-item active" data-hazard="fire">
                <div class="dw-lp-hi-left">
                  <span class="dw-lp-hazard-dot fire"></span>
                  <span class="dw-lp-hi-icon">${I.get('fire')}</span>
                  <span>Wildfires</span>
                </div>
                <span class="dw-lp-badge" id="countFires">0</span>
              </button>
              <button type="button" class="dw-lp-hazard-item active" data-hazard="flood">
                <div class="dw-lp-hi-left">
                  <span class="dw-lp-hazard-dot flood"></span>
                  <span class="dw-lp-hi-icon">${I.get('flood')}</span>
                  <span>Floods</span>
                </div>
                <span class="dw-lp-badge" id="countFloods">0</span>
              </button>
              <button type="button" class="dw-lp-hazard-item active" data-hazard="volcano">
                <div class="dw-lp-hi-left">
                  <span class="dw-lp-hazard-dot volcano"></span>
                  <span class="dw-lp-hi-icon">${I.get('volcano')}</span>
                  <span>Volcanoes</span>
                </div>
                <span class="dw-lp-badge" id="countVolcanoes">0</span>
              </button>
            </div>
          </div>

          <!-- Timeframe Selector -->
          <div class="dw-lp-timeframe">
            <span class="dw-lp-tf-label">TIMEFRAME</span>
            <div class="dw-lp-tf-pills">
              <button type="button" class="dw-tf-pill active" data-tf="24h">24H</button>
              <button type="button" class="dw-tf-pill" data-tf="7d">7D</button>
              <button type="button" class="dw-tf-pill" data-tf="30d">30D</button>
            </div>
          </div>
        </div>
      </div>
    `;

    setupEvents();
    setupSubscriptions();
  }

  function setupEvents() {
    // Panel Collapse Toggle
    document.getElementById('btnTogglePanel')?.addEventListener('click', () => {
      const panel = document.getElementById('dwLayerPanel');
      panel.classList.toggle('collapsed');
      const isCollapsed = panel.classList.contains('collapsed');
      DWState.set('isLeftPanelOpen', !isCollapsed);
      const btn = document.getElementById('btnTogglePanel');
      btn.innerHTML = isCollapsed ? window.DWIcons.get('chevronRight') : window.DWIcons.get('chevronLeft');
      setTimeout(() => window.MapView?.invalidateSize(), 250);
    });

    // Satellite Base Layer
    document.getElementById('btnLayerSatellite')?.addEventListener('click', () => {
      setActiveBaseItem('btnLayerSatellite');
      window.MapView?.switchBaseLayer('satellite');
    });

    // Radar Button: toggles radar overlay and triggers timeline
    document.getElementById('btnLayerRadar')?.addEventListener('click', () => {
      const isRadar = DWState.get('activeWeatherOverlay') === 'radar';
      if (isRadar) {
        DWState.set('activeWeatherOverlay', null);
        document.getElementById('btnLayerRadar')?.classList.remove('active');
      } else {
        DWState.set('activeWeatherOverlay', 'radar');
        document.querySelectorAll('[data-overlay]').forEach(b => b.classList.remove('active'));
        document.getElementById('btnLayerRadar')?.classList.add('active');
        DWUtils.showToast('Precipitation radar active. Use timeline bar to animate past frames.', 'info');
      }
    });

    // Live vs HD Satellite sub-options
    document.getElementById('btnSatLive')?.addEventListener('click', () => {
      document.getElementById('btnSatLive').classList.add('active');
      document.getElementById('btnSatHD').classList.remove('active');
      document.querySelector('#btnSatLive .dw-lp-check').classList.remove('invisible');
      document.querySelector('#btnSatHD .dw-lp-check').classList.add('invisible');
      window.MapView?.switchBaseLayer('satellite');
    });

    document.getElementById('btnSatHD')?.addEventListener('click', () => {
      document.getElementById('btnSatHD').classList.add('active');
      document.getElementById('btnSatLive').classList.remove('active');
      document.querySelector('#btnSatHD .dw-lp-check').classList.remove('invisible');
      document.querySelector('#btnSatLive .dw-lp-check').classList.add('invisible');
      window.MapView?.switchBaseLayer('hybrid');
    });

    // Forecast Overlay buttons
    document.querySelectorAll('[data-overlay]').forEach(btn => {
      btn.addEventListener('click', () => {
        const overlay = btn.dataset.overlay;
        const current = DWState.get('activeWeatherOverlay');
        if (current === overlay) {
          DWState.set('activeWeatherOverlay', null);
          btn.classList.remove('active');
        } else {
          document.querySelectorAll('[data-overlay], #btnLayerRadar').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          DWState.set('activeWeatherOverlay', overlay);
          DWUtils.showToast(`Forecast layer: ${overlay.toUpperCase()} enabled. Click any point on map to inspect telemetry.`, 'info');
        }
      });
    });

    // Hazard Filters
    document.querySelectorAll('[data-hazard]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hazard = btn.dataset.hazard;
        DWState.toggleHazard(hazard);
        btn.classList.toggle('active', DWState.get('hazardFilters').has(hazard));
      });
    });

    // Timeframe selector
    document.querySelectorAll('[data-tf]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tf]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        DWState.set('timeframe', btn.dataset.tf);
        window.DisasterApp?.fetchLiveEvents(btn.dataset.tf);
      });
    });
  }

  function setActiveBaseItem(id) {
    document.querySelectorAll('.dw-lp-item[data-layer]').forEach(b => b.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  function updateThreatCounts(events) {
    let q = 0, s = 0, fi = 0, fl = 0, v = 0;
    events.forEach(e => {
      if (e.type === 'earthquake') q++;
      else if (e.type === 'storm') s++;
      else if (e.type === 'fire') fi++;
      else if (e.type === 'flood') fl++;
      else if (e.type === 'volcano') v++;
    });

    const elQ = document.getElementById('countQuakes');
    const elS = document.getElementById('countStorms');
    const elFi = document.getElementById('countFires');
    const elFl = document.getElementById('countFloods');
    const elV = document.getElementById('countVolcanoes');

    if (elQ) elQ.textContent = q;
    if (elS) elS.textContent = s;
    if (elFi) elFi.textContent = fi;
    if (elFl) elFl.textContent = fl;
    if (elV) elV.textContent = v;
  }

  function setupSubscriptions() {
    DWState.on('change:events', (events) => {
      updateThreatCounts(events || []);
    });
  }

  return { render };
})();

window.LayerPanel = LayerPanel;
