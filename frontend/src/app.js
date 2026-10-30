// frontend/src/app.js
// DisasterWatch — Operations Command Center Core Application Coordinator

'use strict';

const DisasterApp = (() => {
  let refreshTimer = null;

  // ─── Auth Guard ─────────────────────────────────────────────────────────────
  function checkAuth() {
    try {
      const u = localStorage.getItem('dw_user');
      const t = localStorage.getItem('dw_token');
      if (!u || !t) {
        window.location.replace('login.html');
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  // ─── Initialize Application ─────────────────────────────────────────────────
  async function init() {
    if (!checkAuth()) return;

    // 1. Initialize Components
    window.MapView?.init('mapRoot');
    window.LayerPanel?.render('layerPanelRoot');
    window.TimelineBar?.render('timelineRoot');
    window.ControlsBar?.render('controlsRoot');
    window.EventDetailPanel?.render('eventDetailRoot');
    window.StatusBar?.render('statusBarRoot');
    window.SettingsModal?.render('modalRoot');

    // 2. Fetch Live Disaster Data
    await fetchLiveEvents(DWState.get('timeframe') || '24h');

    // 3. Start Auto-Refresh Polling
    startAutoRefresh();

    DWUtils.showToast('DisasterWatch online — connected to official global threat feeds', 'info');
  }

  // ─── Fetch Real Live Multi-Hazard Events ─────────────────────────────────────
  async function fetchLiveEvents(timeframe = '24h') {
    try {
      let res;
      try {
        res = await fetch(`/api/v1/hazards/live?timeframe=${timeframe}&type=all`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        res = await fetch(`http://localhost:4000/api/v1/hazards/live?timeframe=${timeframe}&type=all`);
      }

      if (!res.ok) throw new Error('Live data fetch failed');

      const json = await res.json();
      const data = json.data || {};
      const events = data.events || [];

      DWState.set('events', events);

      const status = data.sourceStatus || {};
      const statusSummary = `USGS: ${status.usgs || 'OK'} • GDACS: ${status.gdacs || 'OK'} • EONET: ${status.eonet || 'OK'}`;
      console.log(`[DisasterWatch] Loaded ${events.length} verified events (${statusSummary})`);

      return events;
    } catch (err) {
      console.warn('[DisasterWatch] Failed to fetch live disaster events:', err.message);
      DWUtils.showToast('Live threat feeds temporarily unreachable. Retrying in background...', 'warning');
      return [];
    }
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    const intervalMs = parseInt(localStorage.getItem('dw_refresh_interval') || '300000', 10);
    refreshTimer = setInterval(() => {
      fetchLiveEvents(DWState.get('timeframe') || '24h');
    }, intervalMs);
  }

  return {
    init,
    fetchLiveEvents
  };
})();

window.DisasterApp = DisasterApp;

// Auto-run on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  DisasterApp.init();
});
