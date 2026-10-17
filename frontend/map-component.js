/**
 * map-component.js — DisasterWatch Reusable Interactive Leaflet Map Component
 * ONLY Real, Confirmed, Observed Data (USGS, NASA EONET, RainViewer)
 * NO simulated, mock, or placeholder data.
 */

'use strict';

const DisasterMap = (() => {
  // Default centered on Tamil Nadu, India (matches Tiruppur, Karur, Dindigul, Trichy)
  let defaultCenter = [11.1271, 78.6569];
  let defaultZoom = 8;

  let map = null;
  let currentLayerName = 'street';
  let baseLayers = {};
  
  // Specific disaster layer groups
  let layerGroups = {
    earthquake: null,
    flood: null,
    storm: null,
    fire: null,
    volcano: null
  };
  let activeTypes = new Set(['earthquake', 'flood', 'storm', 'fire', 'volcano']);

  // Rainfall overlay layer
  let rainfallTileLayer = null;
  let isRainfallActive = false;
  let rainfallMeta = null;

  // Markers and User Location
  let searchMarker = null;
  let userLocationMarker = null;
  let userAccuracyCircle = null;
  let userCoords = null; // { lat, lng, accuracy, isApproximate }

  // Events data store
  let verifiedEvents = [];
  let currentTimeframe = '24h';
  let lastFetchTime = null;

  // ─── Haversine Distance Calculator ─────────────────────────────────────────
  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  // ─── Service Worker Registration ─────────────────────────────────────────
  function initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[DisasterMap] Service Worker registration failed:', err);
      });
    }
  }

  // ─── Base Tile Layers ────────────────────────────────────────────────────
  function createTileLayers() {
    // 1. Street View (OpenStreetMap Standard)
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      crossOrigin: true
    });

    // 2. Satellite View (Esri World Imagery)
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; USDA, USGS, AeroGRID, IGN, and GIS User Community',
      crossOrigin: true
    });

    // 3. Hybrid View (Esri Imagery with Esri keyless boundaries & road labels)
    const hybridBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Sources: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      crossOrigin: true
    });
    const hybridLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Labels &copy; Esri',
      crossOrigin: true
    });
    const hybrid = L.layerGroup([hybridBase, hybridLabels]);

    // 4. Terrain View (Esri World Topo Map)
    const terrain = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; USGS, NOAA',
      crossOrigin: true
    });

    baseLayers = { street, satellite, hybrid, terrain };
    return baseLayers;
  }

  // ─── Map Initialization ──────────────────────────────────────────────────
  function init(containerId = 'realMap', options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (map) {
      invalidateSize();
      return map;
    }

    initServiceWorker();
    createTileLayers();

    const center = options.center || defaultCenter;
    const zoom = options.zoom || defaultZoom;

    map = L.map(containerId, {
      center,
      zoom,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true
    });

    baseLayers.street.addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.control.scale({
      position: 'bottomleft',
      metric: true,
      imperial: false,
      maxWidth: 140
    }).addTo(map);

    // Initialize individual disaster layer groups
    Object.keys(layerGroups).forEach(key => {
      layerGroups[key] = L.layerGroup().addTo(map);
    });

    setupNetworkStatusListener();
    setupUIControls();

    // Fetch real, confirmed disaster data from backend
    fetchLiveDisasterData(currentTimeframe);

    setTimeout(invalidateSize, 100);
    setTimeout(invalidateSize, 400);

    return map;
  }

  // ─── Switch Base Layer ───────────────────────────────────────────────────
  function setBaseLayer(layerName) {
    if (!map || !baseLayers[layerName]) return;
    if (currentLayerName === layerName) return;

    Object.values(baseLayers).forEach(layer => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });

    baseLayers[layerName].addTo(map);
    currentLayerName = layerName;

    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layer === layerName);
    });
  }

  function invalidateSize() {
    if (map) map.invalidateSize();
  }

  // ─── Network Status Monitoring ───────────────────────────────────────────
  function setupNetworkStatusListener() {
    const statusEl = document.getElementById('mapNetStatus');
    function updateNetStatus() {
      if (!statusEl) return;
      if (navigator.onLine) {
        statusEl.className = 'map-net-status online';
        statusEl.innerHTML = '<span class="status-dot-sm green"></span> ONLINE (LIVE FEED)';
      } else {
        statusEl.className = 'map-net-status offline';
        statusEl.innerHTML = '<span class="status-dot-sm red"></span> OFFLINE MODE (CACHED)';
      }
    }
    window.addEventListener('online', updateNetStatus);
    window.addEventListener('offline', updateNetStatus);
    updateNetStatus();
  }

  // ─── FEATURE 1: Exact "Find My Location" ──────────────────────────────────
  function locateUser() {
    if (!map) return;
    if (!navigator.geolocation) {
      if (window.DW?.showToast) DW.showToast('Geolocation is not supported by your browser.', 'warning');
      else console.warn('Geolocation is not supported');
      return;
    }

    const locBtn = document.getElementById('btnMyLocation');
    const userChip = document.getElementById('userLocationChip');
    if (locBtn) locBtn.classList.add('loading');

    // High accuracy browser geolocation options
    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locBtn) locBtn.classList.remove('loading');
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy); // meters
        const isApproximate = accuracy > 1000;

        userCoords = { lat, lng, accuracy, isApproximate, timestamp: pos.timestamp };

        // Clean previous marker and circle
        if (userLocationMarker) map.removeLayer(userLocationMarker);
        if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

        // Draw accuracy circle
        userAccuracyCircle = L.circle([lat, lng], {
          radius: accuracy,
          color: isApproximate ? '#FF9800' : '#2196F3',
          fillColor: isApproximate ? '#FF9800' : '#2196F3',
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: isApproximate ? '4, 4' : null
        }).addTo(map);

        // Custom pulsing GPS pin
        const icon = L.divIcon({
          className: 'user-gps-marker',
          html: `
            <div class="user-gps-pulse ${isApproximate ? 'approx' : ''}"></div>
            <div class="user-gps-dot ${isApproximate ? 'approx' : ''}"></div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        const statusLabel = isApproximate
          ? `⚠️ <strong>Approximate Location</strong> (±${(accuracy / 1000).toFixed(1)} km)`
          : `📍 <strong>Exact GPS Position</strong> (Accuracy: ±${accuracy} m)`;

        userLocationMarker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div class="disaster-popup">
              <div class="dp-header" style="border-left: 3px solid ${isApproximate ? '#FF9800' : '#2196F3'}">
                <span class="dp-icon">📍</span>
                <div>
                  <div class="dp-title">${isApproximate ? 'Approximate Location' : 'Your Verified Position'}</div>
                  <div class="dp-type">${statusLabel}</div>
                </div>
              </div>
              <div class="dp-body">
                <div><strong>Latitude:</strong> ${lat.toFixed(5)}° N</div>
                <div><strong>Longitude:</strong> ${lng.toFixed(5)}° E</div>
                <div><strong>Accuracy Radius:</strong> ±${accuracy.toLocaleString()} meters</div>
                <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Acquired via High-Accuracy W3C Geolocation API</div>
              </div>
            </div>
          `)
          .openPopup();

        // Update User Location Chip on UI
        if (userChip) {
          userChip.classList.remove('hidden');
          const distInfo = findNearestDisaster(lat, lng);
          userChip.innerHTML = `
            <span>📍 My Location: ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E (±${accuracy}m)</span>
            ${distInfo ? `<span>&bull; Nearest event: <strong>${distInfo.distance} km</strong> (${distInfo.title})</span>` : ''}
          `;
        }

        map.flyTo([lat, lng], Math.max(map.getZoom(), 12), { duration: 1.2 });
      },
      (err) => {
        if (locBtn) locBtn.classList.remove('loading');
        console.warn('[DisasterMap] Geolocation error:', err);

        let errMsg = 'Unable to determine your location.';
        if (err.code === 1) { // PERMISSION_DENIED
          errMsg = 'Location permission was denied. Please allow location access in your browser settings to pinpoint your location.';
        } else if (err.code === 2) { // POSITION_UNAVAILABLE
          errMsg = 'Position unavailable. GPS / Network location could not be determined at this moment.';
        } else if (err.code === 3) { // TIMEOUT
          errMsg = 'Location request timed out. Please check your connection and retry.';
        }

        if (window.DW?.showToast) DW.showToast(errMsg, 'warning');
        else console.warn(errMsg);
      },
      geoOptions
    );
  }

  function findNearestDisaster(userLat, userLng) {
    if (!verifiedEvents || verifiedEvents.length === 0) return null;
    let minDistance = Infinity;
    let nearest = null;

    for (const ev of verifiedEvents) {
      if (typeof ev.lat === 'number' && typeof ev.lng === 'number') {
        const d = calculateDistanceKm(userLat, userLng, ev.lat, ev.lng);
        if (d < minDistance) {
          minDistance = d;
          nearest = { distance: d, title: ev.title, type: ev.type };
        }
      }
    }
    return nearest;
  }

  let lastFetchError = null;

  // ─── FEATURE 2: Fetch and Render Live Verified Disaster Events ───────────
  async function fetchLiveDisasterData(timeframe = '24h') {
    currentTimeframe = timeframe;
    const lastUpdatedEl = document.getElementById('mapLastUpdated');
    const staleWarningEl = document.getElementById('mapStaleWarning');
    const emptyStateEl = document.getElementById('mapEmptyState');

    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Connecting to official feeds...';

    try {
      let response;
      try {
        response = await fetch(`/api/v1/hazards/live?timeframe=${timeframe}&type=all`);
        if (!response.ok && response.status !== 502) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (proxyErr) {
        response = await fetch(`http://localhost:4000/api/v1/hazards/live?timeframe=${timeframe}&type=all`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const data = result.data || {};
      verifiedEvents = data.events || [];
      lastFetchTime = data.lastUpdated || new Date().toISOString();
      lastFetchError = null;

      const sourceStatus = data.sourceStatus || {};
      const usgsStatus = sourceStatus.usgs === 'ok' ? 'OK' : (sourceStatus.usgs || 'OK');
      const gdacsStatus = sourceStatus.gdacs === 'ok' ? 'OK' : (sourceStatus.gdacs || 'OK');
      const eonetStatus = sourceStatus.eonet === 'ok' ? 'OK' : (sourceStatus.eonet || 'OK');
      const statusText = `USGS: ${usgsStatus} • GDACS: ${gdacsStatus} • EONET: ${eonetStatus}`;

      if (lastUpdatedEl) {
        const dateObj = new Date(lastFetchTime);
        lastUpdatedEl.textContent = `Updated: ${dateObj.toLocaleTimeString()} (${timeframe.toUpperCase()}) | ${statusText}`;
      }

      const anyFailed = Object.values(sourceStatus).includes('failed');
      const anyCached = Object.values(sourceStatus).includes('cached');

      if (staleWarningEl) {
        if (anyFailed || anyCached) {
          staleWarningEl.textContent = `⚠️ Partial feed status: ${statusText}`;
          staleWarningEl.classList.remove('hidden');
        } else {
          staleWarningEl.classList.add('hidden');
        }
      }

      renderVerifiedMarkers();
      updateDashboardTelemetry(data);
    } catch (err) {
      console.warn('[DisasterMap] Failed to fetch live disaster data:', err);
      lastFetchError = err;
      if (lastUpdatedEl) lastUpdatedEl.textContent = 'Live data error';
      if (staleWarningEl) {
        staleWarningEl.textContent = '⚠️ Live official feeds temporarily unreachable.';
        staleWarningEl.classList.remove('hidden');
      }

      // Show error state with Retry button (NEVER say "No confirmed disasters" on error)
      if (emptyStateEl) {
        emptyStateEl.innerHTML = `
          <div style="font-weight:600; color:var(--accent); margin-bottom:6px;">⚠️ Official Live Feeds Temporarily Unreachable</div>
          <div style="font-size:11px; margin-bottom:12px; color:var(--text-muted);">Could not reach disaster monitoring backend. Please ensure backend is running on port 4000.</div>
          <button type="button" class="btn-map-action" style="margin:0 auto; display:flex;" onclick="DisasterMap.fetchLiveDisasterData('${timeframe}')">
            <span>🔄 Retry Connection</span>
          </button>
        `;
        emptyStateEl.classList.remove('hidden');
      }
    }
  }

  const TYPE_CONFIG = {
    earthquake: { icon: '🌍', color: '#FF3B3B', label: 'Confirmed Earthquake' },
    flood: { icon: '🌊', color: '#00BCD4', label: 'Observed Flood Event' },
    storm: { icon: '🌪️', color: '#FF9800', label: 'Active Cyclone / Storm' },
    fire: { icon: '🔥', color: '#E91E63', label: 'Confirmed Wildfire' },
    volcano: { icon: '🌋', color: '#9C27B0', label: 'Active Volcano Eruption' },
    other: { icon: '⚠️', color: '#795548', label: 'Confirmed Disaster Event' }
  };

  function createMarkerIcon(type, severity) {
    const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.other;
    return L.divIcon({
      className: 'disaster-map-marker',
      html: `
        <div class="dmm-pulse sev-${severity || 'medium'}" style="--marker-color: ${cfg.color}"></div>
        <div class="dmm-badge" style="background: ${cfg.color}">${cfg.icon}</div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
  }

  function renderVerifiedMarkers() {
    // Clear all layer groups
    Object.values(layerGroups).forEach(group => group && group.clearLayers());

    let renderedCount = 0;
    const emptyStateEl = document.getElementById('mapEmptyState');

    verifiedEvents.forEach(ev => {
      const type = ev.type;
      // Skip if layer is toggled off
      if (!activeTypes.has(type)) return;

      const targetGroup = layerGroups[type] || layerGroups.earthquake;
      if (!targetGroup) return;

      const lat = ev.lat;
      const lng = ev.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;

      const marker = L.marker([lat, lng], {
        icon: createMarkerIcon(type, ev.severity)
      });

      const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.other;
      const dateFormatted = new Date(ev.time).toLocaleString();

      // Distance from user location if available
      let userDistHtml = '';
      if (userCoords) {
        const dist = calculateDistanceKm(userCoords.lat, userCoords.lng, lat, lng);
        userDistHtml = `<div><strong>Distance from you:</strong> <span style="color:#2196F3">${dist.toLocaleString()} km</span></div>`;
      }

      const popupHtml = `
        <div class="disaster-popup">
          <div class="dp-header" style="border-left: 3px solid ${cfg.color}">
            <span class="dp-icon">${cfg.icon}</span>
            <div>
              <div class="dp-title">${ev.title}</div>
              <div class="dp-type">${cfg.label.toUpperCase()} &bull; <span class="dp-sev ${ev.severity}">${(ev.severity || 'CONFIRMED').toUpperCase()}</span></div>
            </div>
          </div>
          <div class="dp-body">
            <div><strong>Location:</strong> ${ev.location || 'Reported Coordinates'}</div>
            <div><strong>Coordinates:</strong> ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E</div>
            <div><strong>Observed Date/Time:</strong> ${dateFormatted}</div>
            <div><strong>Status:</strong> <span style="color:#4CAF50">✓ ${ev.status || 'Confirmed & Verified'}</span></div>
            ${ev.magnitude ? `<div><strong>Magnitude:</strong> M ${ev.magnitude}</div>` : ''}
            ${ev.depth ? `<div><strong>Depth:</strong> ${ev.depth}</div>` : ''}
            ${userDistHtml}
            <div style="border-top:1px solid var(--border); padding-top:6px; margin-top:4px;">
              <strong>Official Source:</strong><br>
              <a href="${ev.sourceUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--accent); font-weight:600; text-decoration:underline;">
                ${ev.source} ↗
              </a>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        if (typeof window.showEventDetail === 'function') {
          window.showEventDetail(ev);
        }
      });

      targetGroup.addLayer(marker);
      renderedCount++;
    });

    // Empty state message if 0 events rendered
    if (emptyStateEl) {
      if (lastFetchError) {
        // Keep error UI active
        emptyStateEl.classList.remove('hidden');
      } else if (renderedCount === 0) {
        emptyStateEl.textContent = 'No confirmed disasters reported in this region or active filter right now.';
        emptyStateEl.classList.remove('hidden');
      } else {
        emptyStateEl.classList.add('hidden');
      }
    }
  }

  function toggleDisasterType(type, isEnabled) {
    if (isEnabled) {
      activeTypes.add(type);
      if (layerGroups[type] && !map.hasLayer(layerGroups[type])) {
        map.addLayer(layerGroups[type]);
      }
    } else {
      activeTypes.delete(type);
      if (layerGroups[type] && map.hasLayer(layerGroups[type])) {
        map.removeLayer(layerGroups[type]);
      }
    }
    renderVerifiedMarkers();
  }

  // ─── FEATURE 3: Observed Rainfall Layer (RainViewer Past Radar) ───────────
  async function toggleRainfallLayer() {
    const btn = document.getElementById('btnToggleRainfall');
    const legend = document.getElementById('rainfallLegend');
    const metaEl = document.getElementById('rainfallMetaInfo');

    if (isRainfallActive) {
      // Turn off
      if (rainfallTileLayer && map.hasLayer(rainfallTileLayer)) {
        map.removeLayer(rainfallTileLayer);
      }
      isRainfallActive = false;
      if (btn) btn.classList.remove('active');
      if (legend) legend.classList.add('hidden');
      return;
    }

    // Turn on: fetch latest observed radar frame
    if (btn) btn.classList.add('loading');
    try {
      let res;
      try {
        res = await fetch('/api/v1/hazards/rainfall-radar');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (proxyErr) {
        res = await fetch('http://localhost:4000/api/v1/hazards/rainfall-radar');
      }

      if (!res.ok) throw new Error('Failed to fetch radar metadata');

      const json = await res.json();
      rainfallMeta = json.data;

      if (!rainfallMeta || !rainfallMeta.tileUrlTemplate) {
        if (window.DW?.showToast) DW.showToast('Observed rainfall radar is currently updating. Please try again shortly.', 'warning');
        return;
      }

      if (rainfallTileLayer && map.hasLayer(rainfallTileLayer)) {
        map.removeLayer(rainfallTileLayer);
      }

      rainfallTileLayer = L.tileLayer(rainfallMeta.tileUrlTemplate, {
        opacity: 0.65,
        zIndex: 50,
        attribution: '&copy; <a href="https://www.rainviewer.com/api.html" target="_blank">RainViewer</a> Observed Radar'
      });

      rainfallTileLayer.addTo(map);
      isRainfallActive = true;

      if (btn) {
        btn.classList.remove('loading');
        btn.classList.add('active');
      }

      if (legend) legend.classList.remove('hidden');
      if (metaEl) metaEl.textContent = rainfallMeta.timeWindowLabel || 'Observed past radar (No forecast)';
      if (window.DW?.showToast) DW.showToast('RainViewer observed rainfall radar enabled', 'info');
    } catch (err) {
      console.warn('[DisasterMap] Radar error:', err);
      if (btn) btn.classList.remove('loading');
      if (window.DW?.showToast) DW.showToast('Unable to connect to live rainfall radar feed.', 'error');
    }
  }

  // ─── FEATURE 4: Global Disaster Summary ──────────────────────────────────
  async function openGlobalSummary(timeframe = currentTimeframe) {
    const drawer = document.getElementById('globalSummaryDrawer');
    const content = document.getElementById('globalSummaryContent');
    if (!drawer || !content) return;

    drawer.classList.remove('hidden');
    content.innerHTML = '<div class="mono" style="padding:20px; color:var(--text-muted)">Aggregating confirmed global disasters...</div>';

    try {
      let res;
      try {
        res = await fetch(`/api/v1/hazards/summary?timeframe=${timeframe}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (proxyErr) {
        res = await fetch(`http://localhost:4000/api/v1/hazards/summary?timeframe=${timeframe}`);
      }

      if (!res.ok) throw new Error('Summary fetch failed');
      const json = await res.json();
      const sum = json.data;

      let html = `
        <div class="gs-stats-row">
          <div class="gs-card">
            <div class="gs-card-num">${sum.totalActiveDisasters}</div>
            <div class="gs-card-label">CONFIRMED EVENTS (${sum.timeframe.toUpperCase()})</div>
          </div>
          <div class="gs-card">
            <div class="gs-card-num">${sum.byCountry?.length || 0}</div>
            <div class="gs-card-label">AFFECTED COUNTRIES / REGIONS</div>
          </div>
        </div>

        <div class="gs-section-title mono">BY DISASTER TYPE</div>
        <div class="gs-chips">
          ${Object.entries(sum.byType || {}).map(([type, count]) => `
            <span class="gs-chip">${type}: <strong>${count}</strong></span>
          `).join('')}
        </div>

        <div class="gs-section-title mono" style="margin-top:16px;">CONFIRMED DISASTERS BY COUNTRY</div>
        <div class="gs-country-list">
          ${(sum.byCountry || []).map(c => `
            <div class="gs-country-item" data-lat="${c.sampleCoords[0]}" data-lng="${c.sampleCoords[1]}">
              <div>
                <div class="gs-country-name">${c.country}</div>
                <div class="gs-country-types">${Object.entries(c.types).map(([t, cnt]) => `${t} (${cnt})`).join(', ')}</div>
              </div>
              <div class="gs-country-count">${c.count}</div>
            </div>
          `).join('')}
        </div>
      `;

      content.innerHTML = html;

      // Click on country to fly map
      content.querySelectorAll('.gs-country-item').forEach(item => {
        item.addEventListener('click', () => {
          const lat = parseFloat(item.dataset.lat);
          const lng = parseFloat(item.dataset.lng);
          if (!isNaN(lat) && !isNaN(lng)) {
            map.flyTo([lat, lng], 6, { duration: 1.5 });
            drawer.classList.add('hidden');
          }
        });
      });
    } catch (err) {
      content.innerHTML = '<div style="color:var(--accent); padding:20px;">Failed to load global summary.</div>';
    }
  }

  // ─── Search Place by Name ────────────────────────────────────────────────
  async function searchPlace(query) {
    if (!query || !query.trim() || !map) return;
    const term = query.trim();
    const searchBtn = document.getElementById('mapSearchBtn');
    if (searchBtn) searchBtn.classList.add('loading');

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(term)}&limit=1`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      if (!data || data.length === 0) {
        if (window.DW?.showToast) DW.showToast(`No results found for "${term}".`, 'info');
        return;
      }

      const top = data[0];
      const lat = parseFloat(top.lat);
      const lon = parseFloat(top.lon);

      if (searchMarker) map.removeLayer(searchMarker);

      const searchIcon = L.divIcon({
        className: 'search-result-marker',
        html: '<div class="search-pin">📍</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      });

      searchMarker = L.marker([lat, lon], { icon: searchIcon })
        .addTo(map)
        .bindPopup(`<b>${top.display_name.split(',')[0]}</b><br><small>${top.display_name}</small>`)
        .openPopup();

      map.flyTo([lat, lon], 11, { duration: 1.5 });
    } catch (err) {
      if (window.DW?.showToast) {
        DW.showToast('Search service unavailable. Centering on default Tamil Nadu coordinates.', 'warning');
      }
      map.flyTo(defaultCenter, defaultZoom, { duration: 1.2 });
    } finally {
      if (searchBtn) searchBtn.classList.remove('loading');
    }
  }

  // ─── Reset View to Tamil Nadu ────────────────────────────────────────────
  function resetView() {
    if (map) map.flyTo(defaultCenter, defaultZoom, { duration: 1.0 });
  }

  // ─── Update Main Dashboard Counters with Real Telemetry ──────────────────
  function updateDashboardTelemetry(data) {
    const events = data.events || [];
    let floods = 0;
    let quakes = 0;
    let storms = 0;
    let fires = 0;

    events.forEach(e => {
      if (e.type === 'flood') floods++;
      if (e.type === 'earthquake') quakes++;
      if (e.type === 'storm') storms++;
      if (e.type === 'fire') fires++;
    });

    const scFloods = document.getElementById('sc-floods');
    const scQuakes = document.getElementById('sc-quakes');
    const scStorms = document.getElementById('sc-storms');
    const scFires = document.getElementById('sc-fires');

    if (scFloods) scFloods.textContent = floods;
    if (scQuakes) scQuakes.textContent = quakes;
    if (scStorms) scStorms.textContent = storms;
    if (scFires) scFires.textContent = fires;
  }

  // ─── UI Controls Setup ───────────────────────────────────────────────────
  function setupUIControls() {
    // Layer Switcher Buttons
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        setBaseLayer(btn.dataset.layer);
      });
    });

    // Search Place
    const searchInput = document.getElementById('mapSearchInput');
    const searchBtn = document.getElementById('mapSearchBtn');
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => searchPlace(searchInput.value));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchPlace(searchInput.value);
        }
      });
    }

    // Exact My Location
    document.getElementById('btnMyLocation')?.addEventListener('click', locateUser);

    // Default View
    document.getElementById('btnResetView')?.addEventListener('click', resetView);

    // Observed Rainfall Toggle
    document.getElementById('btnToggleRainfall')?.addEventListener('click', toggleRainfallLayer);

    // Global Disaster Summary Toggle
    document.getElementById('btnToggleSummary')?.addEventListener('click', () => openGlobalSummary(currentTimeframe));
    document.getElementById('closeSummaryDrawer')?.addEventListener('click', () => {
      document.getElementById('globalSummaryDrawer')?.classList.add('hidden');
    });

    // Summary timeframe buttons
    document.querySelectorAll('.gs-tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gs-tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        openGlobalSummary(btn.dataset.tf);
      });
    });

    // Timeframe selector on map toolbar
    document.querySelectorAll('.map-tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        fetchLiveDisasterData(btn.dataset.tf);
      });
    });

    // Disaster Type Checkbox Filters
    document.querySelectorAll('.disaster-layer-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        toggleDisasterType(chk.dataset.type, chk.checked);
      });
    });

    // Top Filter Bar Buttons
    document.querySelectorAll('.map-ctrl[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-ctrl[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        if (f === 'all') {
          activeTypes = new Set(['earthquake', 'flood', 'storm', 'fire', 'volcano']);
        } else {
          activeTypes = new Set([f]);
        }
        // Sync checkboxes
        document.querySelectorAll('.disaster-layer-chk').forEach(chk => {
          chk.checked = activeTypes.has(chk.dataset.type);
        });
        renderVerifiedMarkers();
      });
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  return {
    init,
    setBaseLayer,
    invalidateSize,
    locateUser,
    searchPlace,
    resetView,
    toggleRainfallLayer,
    openGlobalSummary,
    fetchLiveDisasterData,
    toggleDisasterType,
    getVerifiedEvents() {
      return verifiedEvents;
    },
    getUserCoordinates() {
      return userCoords;
    },
    setDefault(lat, lng, zoom) {
      defaultCenter = [lat, lng];
      if (zoom) defaultZoom = zoom;
    },
    getMap() {
      return map;
    }
  };
})();

// Attach to window
window.DisasterMap = DisasterMap;
