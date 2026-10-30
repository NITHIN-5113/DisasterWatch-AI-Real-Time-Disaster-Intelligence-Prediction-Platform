// frontend/src/components/MapView.js
// DisasterWatch — Operations Map View Component (Leaflet 100vw x 100vh)

'use strict';

const MapView = (() => {
  let map = null;
  let baseLayers = {};
  let currentBaseLayer = null;

  // Overlays
  let radarTileLayer = null;
  let weatherInspectionMarker = null;

  // Hazard marker layers
  let hazardLayerGroup = null;

  // Distance measurement tool
  let measurePoints = [];
  let measurePolyline = null;
  let measureMarkers = [];

  function init(containerId = 'mapRoot') {
    const el = document.getElementById(containerId);
    if (!el || map) return;

    // 1. Initialize Leaflet Map
    map = L.map(containerId, {
      center: [-6.8, 59.0], // Initial view centered on Indian Ocean (matching user reference)
      zoom: 4,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false, // We use custom slim controls on the right
      attributionControl: false // Handled in custom status bar
    });

    // 2. Setup Base Layers
    setupBaseLayers();

    // 3. Initialize Hazard Marker Group
    hazardLayerGroup = L.layerGroup().addTo(map);

    // 4. Setup Map Event Listeners
    setupMapEvents();

    // 5. Connect to State Store
    setupStateSubscriptions();

    // 6. Invalidate size after layout rendering
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 400);

    return map;
  }

  function setupBaseLayers() {
    // Esri World Imagery (Satellite - Default)
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      crossOrigin: true
    });

    // OpenStreetMap Standard (Streets)
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true
    });

    // Esri Hybrid (Satellite + Place and Road Labels)
    const hybridBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      crossOrigin: true
    });
    const hybridLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      crossOrigin: true
    });
    const hybrid = L.layerGroup([hybridBase, hybridLabels]);

    // Esri World Topo Map (Terrain)
    const terrain = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      crossOrigin: true
    });

    baseLayers = { satellite, streets, hybrid, terrain };

    // Default to satellite
    satellite.addTo(map);
    currentBaseLayer = satellite;
  }

  function switchBaseLayer(name) {
    if (!map || !baseLayers[name]) return;
    if (currentBaseLayer && map.hasLayer(currentBaseLayer)) {
      map.removeLayer(currentBaseLayer);
    }
    baseLayers[name].addTo(map);
    currentBaseLayer = baseLayers[name];
    DWState.set('activeBaseLayer', name);
  }

  function setupMapEvents() {
    // Mouse movement updates cursor coordinates for status bar
    map.on('mousemove', (e) => {
      DWState.set('cursorCoords', { lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.on('zoomend', () => {
      DWState.set('zoomLevel', map.getZoom());
    });

    // Click handler for measurement or weather probing
    map.on('click', async (e) => {
      if (DWState.get('isMeasuring')) {
        handleMeasurementClick(e.latlng);
        return;
      }

      // Check weather overlay probe
      const activeWeather = DWState.get('activeWeatherOverlay');
      if (activeWeather && activeWeather !== 'radar') {
        probePointWeather(e.latlng.lat, e.latlng.lng);
      }
    });
  }

  async function probePointWeather(lat, lng) {
    try {
      const res = await fetch(`/api/v1/hazards/weather-point?lat=${lat}&lng=${lng}`);
      if (!res.ok) return;
      const json = await res.json();
      const w = json.data?.current || {};

      const units = DWState.get('unitSystem');
      const tempStr = DWUtils.formatTemperature(w.temperature, units);
      const speedStr = DWUtils.formatSpeed(w.windSpeed, units);
      const pressStr = DWUtils.formatPressure(w.surfacePressure, units);

      const content = `
        <div class="dw-popup-weather">
          <div class="dw-pw-header">ATMOSPHERIC TELEMETRY</div>
          <div class="dw-pw-coords">${DWUtils.formatCoordinates(lat, lng)}</div>
          <div class="dw-pw-grid">
            <div class="dw-pw-stat">
              <span class="dw-pw-label">Temperature</span>
              <span class="dw-pw-val">${tempStr}</span>
            </div>
            <div class="dw-pw-stat">
              <span class="dw-pw-label">Wind Speed</span>
              <span class="dw-pw-val">${speedStr} (${w.windDirection || 0}°)</span>
            </div>
            <div class="dw-pw-stat">
              <span class="dw-pw-label">Precipitation</span>
              <span class="dw-pw-val">${w.precipitation ?? 0} mm</span>
            </div>
            <div class="dw-pw-stat">
              <span class="dw-pw-label">Humidity</span>
              <span class="dw-pw-val">${w.relativeHumidity ?? 0} %</span>
            </div>
            <div class="dw-pw-stat">
              <span class="dw-pw-label">Pressure</span>
              <span class="dw-pw-val">${pressStr}</span>
            </div>
          </div>
        </div>
      `;

      L.popup()
        .setLatLng([lat, lng])
        .setContent(content)
        .openOn(map);
    } catch (err) {
      console.warn('Weather probe failed:', err);
    }
  }

  function handleMeasurementClick(latlng) {
    measurePoints.push(latlng);

    const icon = L.divIcon({
      className: 'dw-measure-marker',
      html: `<div class="dw-mm-dot"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const marker = L.marker(latlng, { icon }).addTo(map);
    measureMarkers.push(marker);

    if (measurePoints.length > 1) {
      if (measurePolyline) map.removeLayer(measurePolyline);

      measurePolyline = L.polyline(measurePoints, {
        color: '#3B82F6',
        weight: 3,
        dashArray: '6, 6'
      }).addTo(map);

      // Compute total distance
      let totalKm = 0;
      for (let i = 1; i < measurePoints.length; i++) {
        totalKm += DWUtils.calculateDistanceKm(
          measurePoints[i - 1].lat,
          measurePoints[i - 1].lng,
          measurePoints[i].lat,
          measurePoints[i].lng
        );
      }

      const distStr = DWUtils.formatDistance(totalKm, DWState.get('unitSystem'));
      DWUtils.showToast(`Total Measured Distance: ${distStr}`, 'info');
    }
  }

  function clearMeasurement() {
    measurePoints = [];
    if (measurePolyline) {
      map.removeLayer(measurePolyline);
      measurePolyline = null;
    }
    measureMarkers.forEach(m => map.removeLayer(m));
    measureMarkers = [];
  }

  // ─── Radar Tile Layer Updates ───────────────────────────────────────────────
  function updateRadarFrame(frame) {
    if (!map || !frame) return;

    if (radarTileLayer) {
      map.removeLayer(radarTileLayer);
    }

    radarTileLayer = L.tileLayer(frame.tileUrl, {
      opacity: 0.65,
      zIndex: 25,
      crossOrigin: true
    });

    radarTileLayer.addTo(map);
  }

  function removeRadarLayer() {
    if (radarTileLayer && map.hasLayer(radarTileLayer)) {
      map.removeLayer(radarTileLayer);
      radarTileLayer = null;
    }
  }

  // ─── Custom Hazard Markers ──────────────────────────────────────────────────
  function renderHazardMarkers(events) {
    if (!hazardLayerGroup) return;
    hazardLayerGroup.clearLayers();

    const activeFilters = DWState.get('hazardFilters') || new Set();

    events.forEach(ev => {
      if (!activeFilters.has(ev.type)) return;
      if (typeof ev.latitude !== 'number' || typeof ev.longitude !== 'number') return;

      const marker = createCustomMarker(ev);
      marker.on('click', () => {
        DWState.set('selectedEvent', ev);
        map.flyTo([ev.latitude, ev.longitude], Math.max(map.getZoom(), 7), { duration: 1.0 });
      });

      hazardLayerGroup.addLayer(marker);
    });
  }

  function createCustomMarker(ev) {
    const sev = ev.severity || 'medium';
    let iconHtml = '';

    if (ev.type === 'storm') {
      // Swirling cyclone glyph matching Zoom.earth reference
      iconHtml = `
        <div class="dw-marker-cyclone sev-${sev}">
          <div class="dw-cyclone-ring"></div>
          <div class="dw-cyclone-icon">${window.DWIcons.get('storm')}</div>
        </div>
      `;
    } else if (ev.type === 'earthquake') {
      // Seismic ripple rings with magnitude badge
      const magLabel = ev.magnitude ? `M${ev.magnitude}` : '';
      iconHtml = `
        <div class="dw-marker-quake sev-${sev}">
          <div class="dw-quake-pulse"></div>
          <div class="dw-quake-core">${magLabel}</div>
        </div>
      `;
    } else {
      // Clean modern icon badge with glow
      const iconSvg = window.DWIcons.get(ev.type) || window.DWIcons.get('alert');
      iconHtml = `
        <div class="dw-marker-threat type-${ev.type} sev-${sev}">
          <div class="dw-threat-glow"></div>
          <div class="dw-threat-badge">${iconSvg}</div>
        </div>
      `;
    }

    const divIcon = L.divIcon({
      className: 'dw-custom-div-marker',
      html: iconHtml,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    return L.marker([ev.latitude, ev.longitude], { icon: divIcon });
  }

  function setupStateSubscriptions() {
    DWState.on('change:activeBaseLayer', (layerName) => {
      switchBaseLayer(layerName);
    });

    DWState.on('change:events', (events) => {
      renderHazardMarkers(events);
    });

    DWState.on('change:hazardFilters', () => {
      renderHazardMarkers(DWState.get('events') || []);
    });

    DWState.on('change:activeWeatherOverlay', (overlay) => {
      if (overlay !== 'radar') {
        removeRadarLayer();
      }
    });

    DWState.on('change:isMeasuring', (measuring) => {
      if (!measuring) clearMeasurement();
    });
  }

  return {
    init,
    getMap: () => map,
    switchBaseLayer,
    updateRadarFrame,
    removeRadarLayer,
    renderHazardMarkers,
    clearMeasurement,
    flyTo: (lat, lng, zoom = 8) => {
      if (map) map.flyTo([lat, lng], zoom, { duration: 1.2 });
    },
    zoomIn: () => map && map.zoomIn(),
    zoomOut: () => map && map.zoomOut(),
    invalidateSize: () => map && map.invalidateSize()
  };
})();

window.MapView = MapView;
