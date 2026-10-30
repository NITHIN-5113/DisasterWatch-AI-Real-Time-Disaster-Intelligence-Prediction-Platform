// frontend/src/components/SettingsModal.js
// DisasterWatch — Operations Settings & Data Sources Modal Dialog

'use strict';

const SettingsModal = (() => {
  let modalEl = null;

  function render(containerId = 'modalRoot') {
    modalEl = document.getElementById(containerId);
    if (!modalEl) return;

    const I = window.DWIcons;

    modalEl.innerHTML = `
      <div class="dw-modal-backdrop hidden" id="dwModalBackdrop">
        <div class="dw-modal-card" role="dialog" aria-modal="true">
          <!-- Modal Header -->
          <div class="dw-mc-header">
            <div class="dw-mc-tabs" role="tablist">
              <button type="button" class="dw-mc-tab active" id="tabSettings" role="tab">SETTINGS</button>
              <button type="button" class="dw-mc-tab" id="tabSources" role="tab">DATA SOURCES</button>
            </div>
            <button type="button" class="dw-mc-close" id="btnModalClose" aria-label="Close dialog">
              ${I.get('close')}
            </button>
          </div>

          <!-- Settings Tab Content -->
          <div class="dw-mc-body" id="contentSettings">
            <div class="dw-setting-row">
              <div class="dw-sr-info">
                <span class="dw-sr-title">Timezone Standard</span>
                <span class="dw-sr-desc">Choose between standard aviation/meteorological UTC or your local device clock</span>
              </div>
              <div class="dw-sr-control">
                <select class="dw-select" id="selectTimeFormat">
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="LOCAL">Local Device Time</option>
                </select>
              </div>
            </div>

            <div class="dw-setting-row">
              <div class="dw-sr-info">
                <span class="dw-sr-title">Unit System</span>
                <span class="dw-sr-desc">Metric (°C, km/h, mm, km) or Imperial (°F, mph, in, mi)</span>
              </div>
              <div class="dw-sr-control">
                <select class="dw-select" id="selectUnitSystem">
                  <option value="METRIC">Metric (°C, km/h, km, mm)</option>
                  <option value="IMPERIAL">Imperial (°F, mph, mi, in)</option>
                </select>
              </div>
            </div>

            <div class="dw-setting-row">
              <div class="dw-sr-info">
                <span class="dw-sr-title">Live Feed Auto-Refresh</span>
                <span class="dw-sr-desc">Frequency for polling USGS, NASA EONET, and GDACS</span>
              </div>
              <div class="dw-sr-control">
                <select class="dw-select" id="selectRefreshInterval">
                  <option value="120000">Every 2 minutes</option>
                  <option value="300000" selected>Every 5 minutes (Recommended)</option>
                  <option value="600000">Every 10 minutes</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Data Sources Tab Content -->
          <div class="dw-mc-body hidden" id="contentSources">
            <p class="dw-sources-intro">
              DisasterWatch displays strictly observed and verified data. Zero simulated, mock, or placeholder telemetries are used.
            </p>
            <div class="dw-sources-list">
              <div class="dw-source-item">
                <div class="dw-si-title">USGS Earthquake Hazards Program</div>
                <div class="dw-si-desc">Real-time global earthquake hypocenters, Richter magnitudes, and depths. Updated every 1–5 minutes.</div>
                <div class="dw-si-meta">Source: United States Geological Survey &bull; Public Domain</div>
              </div>

              <div class="dw-source-item">
                <div class="dw-si-title">NASA Earth Observatory (EONET v3)</div>
                <div class="dw-si-desc">Verified severe storms, wildfires, volcanic eruptions, and flood hazards curated by NASA ESDIS.</div>
                <div class="dw-si-meta">Source: NASA Earthdata &bull; NASA Open Data Policy</div>
              </div>

              <div class="dw-source-item">
                <div class="dw-si-title">GDACS Global Disaster Alert & Coordination System</div>
                <div class="dw-si-desc">Real-time multi-hazard disaster alerts and impact assessments. Multi-lingual reports and population estimates.</div>
                <div class="dw-si-meta">Source: United Nations OCHA & European Commission JRC</div>
              </div>

              <div class="dw-source-item">
                <div class="dw-si-title">RainViewer Global Radar Network</div>
                <div class="dw-si-desc">Composite 10-minute precipitation radar tiles spanning North America, Europe, Asia, and Australasia.</div>
                <div class="dw-si-meta">Source: RainViewer API &bull; Radar Network</div>
              </div>

              <div class="dw-source-item">
                <div class="dw-si-title">Open-Meteo Global Weather Model</div>
                <div class="dw-si-desc">ECMWF / NOAA GFS atmospheric forecast fields: precipitation, wind speed/direction, temperature, relative humidity, pressure.</div>
                <div class="dw-si-meta">Source: Open-Meteo API &bull; Non-commercial Open Access</div>
              </div>

              <div class="dw-source-item">
                <div class="dw-si-title">Esri World Imagery & NASA GIBS</div>
                <div class="dw-si-desc">High-resolution earth satellite imagery base layer and near-real-time daily MODIS/VIIRS true color passes.</div>
                <div class="dw-si-meta">Source: Esri, USDA, USGS, NASA GIBS</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    setupEvents();
  }

  function setupEvents() {
    const backdrop = document.getElementById('dwModalBackdrop');
    const closeBtn = document.getElementById('btnModalClose');
    const tabSettings = document.getElementById('tabSettings');
    const tabSources = document.getElementById('tabSources');
    const contentSettings = document.getElementById('contentSettings');
    const contentSources = document.getElementById('contentSources');

    closeBtn?.addEventListener('click', () => backdrop.classList.add('hidden'));
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.add('hidden');
    });

    tabSettings?.addEventListener('click', () => {
      tabSettings.classList.add('active');
      tabSources.classList.remove('active');
      contentSettings.classList.remove('hidden');
      contentSources.classList.add('hidden');
    });

    tabSources?.addEventListener('click', () => {
      tabSources.classList.add('active');
      tabSettings.classList.remove('active');
      contentSources.classList.remove('hidden');
      contentSettings.classList.add('hidden');
    });

    // Timezone change
    const selTz = document.getElementById('selectTimeFormat');
    if (selTz) {
      selTz.value = DWState.get('timeFormat') || 'UTC';
      selTz.addEventListener('change', (e) => {
        DWState.setTimeFormat(e.target.value);
        DWUtils.showToast(`Timezone preference set to ${e.target.value}`, 'success');
      });
    }

    // Units change
    const selUnits = document.getElementById('selectUnitSystem');
    if (selUnits) {
      selUnits.value = DWState.get('unitSystem') || 'METRIC';
      selUnits.addEventListener('change', (e) => {
        DWState.setUnitSystem(e.target.value);
        DWUtils.showToast(`Unit system set to ${e.target.value}`, 'success');
      });
    }
  }

  function open() {
    const backdrop = document.getElementById('dwModalBackdrop');
    if (!backdrop) return;
    document.getElementById('tabSettings')?.click();
    backdrop.classList.remove('hidden');
  }

  function openInfo() {
    const backdrop = document.getElementById('dwModalBackdrop');
    if (!backdrop) return;
    document.getElementById('tabSources')?.click();
    backdrop.classList.remove('hidden');
  }

  return { render, open, openInfo };
})();

window.SettingsModal = SettingsModal;
