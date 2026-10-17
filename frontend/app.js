/**
 * app.js — DisasterWatch Main Application Logic
 */

// ─── Auth Guard ─────────────────────────────────────────────────────────────
(function authGuard() {
  const user = DW.storage.getUser();
  const token = DW.storage.get('dw_token');
  if (!user || !token) {
    DW.storage.clearUser();
    DW.storage.remove('dw_token');
    window.location.replace('login.html');
    return;
  }
  const info = document.getElementById('userInfo');
  if (info) {
    info.querySelector('.user-name').textContent = user.name || user.email || user.id;
    info.querySelector('.user-avatar').textContent = (user.name || user.email || user.id)[0].toUpperCase();
  }
})();

// ─── Logout ──────────────────────────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  DW.storage.clearUser();
  DW.storage.remove('dw_token');
  window.location.replace('login.html');
});

// ─── Live Clock ──────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('liveClock');
  if (el) el.textContent = new Date().toUTCString().slice(17, 25) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// ─── Sidebar Toggle & Map Resize ─────────────────────────────────────────────
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
  setTimeout(() => {
    if (window.DisasterMap) DisasterMap.invalidateSize();
  }, 250);
});

window.addEventListener('resize', () => {
  if (window.DisasterMap) DisasterMap.invalidateSize();
});

// ─── View Routing ────────────────────────────────────────────────────────────
const viewTitles = {
  dashboard: 'Command Dashboard',
  map: 'Live Disaster Map',
  alerts: 'Active Alerts',
  report: 'Submit Report',
  predict: 'ML Risk Prediction',
  analytics: 'Analytics'
};

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (navItem) navItem.classList.add('active');

  document.getElementById('viewTitle').textContent = viewTitles[name] || name;

  // Trigger view-specific init
  if (name === 'map') renderMap();
  if (name === 'alerts') renderAlerts('all');
  if (name === 'dashboard') renderDashboard();
  if (name === 'report') renderCommunityReports();
  if (name === 'predict') MLModel.renderForm();
  if (name === 'analytics') renderAnalytics();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(item.dataset.view);
  });
});

const TYPE_EMOJI = { earthquake: '🌍', flood: '🌊', storm: '🌪️', fire: '🔥', landslide: '⛰️', tsunami: '🌊', volcano: '🌋', other: '⚠️' };
const SEV_COLORS = { critical: '#FF3B3B', high: '#FF8C00', medium: '#FFD600', low: '#4CAF50' };

// ─── Dashboard ───────────────────────────────────────────────────────────────
async function renderDashboard() {
  await renderRecentEvents();
  renderRiskZones();
  renderActivityChart();
}

async function renderRecentEvents() {
  const list = document.getElementById('recentEventsList');
  if (!list) return;

  // Try live hazard API first (DB events synced from USGS)
  try {
    const response = await DW.api.get('/hazards?perPage=6&sortBy=occurredAt&order=desc');
    const recent = response.data || [];

    if (recent.length === 0) {
      // Fallback: try live events feed
      throw new Error('No DB events, falling back to live feed');
    }

    list.innerHTML = recent.map(d => {
      const severity = d.riskLevel || 'medium';
      const location = d.place || `${(d.latitude || 0).toFixed(1)}, ${(d.longitude || 0).toFixed(1)}`;
      const time = DW.timeAgo(d.occurredAt);
      return `
        <div class="event-item sev-${severity}">
          <div class="ei-icon">${TYPE_EMOJI[d.type?.toLowerCase()] || '⚠️'}</div>
          <div class="ei-body">
            <div class="ei-title">${DW.capitalize(d.type)} — ${location}</div>
            <div class="ei-meta mono">${time} · Official Source: USGS / NASA EONET</div>
          </div>
          <div class="ei-sev sev-badge-${severity}">${severity.toUpperCase()}</div>
        </div>
      `;
    }).join('');
  } catch {
    // Fallback: use live feed events from DisasterMap if available
    try {
      let res;
      try {
        res = await fetch('/api/v1/hazards/live?timeframe=24h&type=all');
        if (!res.ok) throw new Error('Proxy error');
      } catch (proxyErr) {
        res = await fetch('http://localhost:4000/api/v1/hazards/live?timeframe=24h&type=all');
      }
      if (!res.ok) throw new Error('Live feed unavailable');
      const json = await res.json();
      const events = (json.data?.events || []).slice(0, 6);

      if (events.length === 0) {
        list.innerHTML = '<div class="no-data">No confirmed disasters in the last 24 hours.</div>';
        return;
      }

      list.innerHTML = events.map(d => {
        const sev = d.severity || 'medium';
        const timeStr = d.time ? DW.timeAgo(d.time) : 'Recent';
        return `
          <div class="event-item sev-${sev}">
            <div class="ei-icon">${TYPE_EMOJI[d.type] || '⚠️'}</div>
            <div class="ei-body">
              <div class="ei-title">${d.title || DW.capitalize(d.type)}</div>
              <div class="ei-meta mono">${timeStr} · ${d.source || 'Official Feed'}</div>
            </div>
            <div class="ei-sev sev-badge-${sev}">${sev.toUpperCase()}</div>
          </div>
        `;
      }).join('');
    } catch (fallbackErr) {
      console.error('Failed to load recent events from any source:', fallbackErr);
      list.innerHTML = '<div class="no-data">Live feed temporarily unavailable. No confirmed events to display.</div>';
    }
  }
}

function renderRiskZones() {
  const list = document.getElementById('riskList');
  if (!list) return;
  const zones = [
    { region: 'Southeast Asia', score: 92, level: 'critical' },
    { region: 'South Asia', score: 87, level: 'critical' },
    { region: 'Western USA', score: 74, level: 'high' },
    { region: 'Gulf Coast', score: 68, level: 'high' },
    { region: 'Turkey / Greece', score: 55, level: 'medium' },
    { region: 'East Africa', score: 42, level: 'medium' },
  ];
  list.innerHTML = zones.map(z => `
    <div class="risk-item">
      <div class="risk-label">${z.region}</div>
      <div class="risk-bar-wrap">
        <div class="risk-bar" style="width:${z.score}%; background:${SEV_COLORS[z.level]}"></div>
      </div>
      <div class="risk-score mono">${z.score}</div>
    </div>
  `).join('');
}

function renderActivityChart() {
  const chart = document.getElementById('activityChart');
  if (!chart) return;
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const values = [3,2,1,1,2,4,5,6,8,7,9,11,10,8,7,9,12,14,11,8,6,5,4,3];
  const max = Math.max(...values);
  chart.innerHTML = `
    <div class="bar-chart">
      ${hours.map((h, i) => `
        <div class="bar-col">
          <div class="bar-fill" style="height:${(values[i]/max)*100}%" title="${values[i]} events at ${h}:00"></div>
          ${h % 6 === 0 ? `<div class="bar-label mono">${String(h).padStart(2,'0')}</div>` : '<div class="bar-label"></div>'}
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Map View ────────────────────────────────────────────────────────────────
let activeFilter = 'all';

function renderMap() {
  if (!window.DisasterMap) {
    console.warn('[app.js] DisasterMap component not loaded yet.');
    return;
  }

  // Initialize the real Leaflet map instance
  DisasterMap.init('realMap');

  // Fetch and render real, confirmed live disaster data from official sources
  // (USGS Earthquakes + NASA EONET — no mock data)
  DisasterMap.fetchLiveDisasterData('24h');

  // Invalidate size immediately and after layout rendering
  DisasterMap.invalidateSize();
  setTimeout(() => DisasterMap.invalidateSize(), 150);
  setTimeout(() => DisasterMap.invalidateSize(), 400);
}

// Expose showMapDetail globally for Leaflet popup click callbacks
window.showEventDetail = showMapDetail;

function showMapDetail(d) {
  const panel = document.getElementById('mapDetailPanel');
  if (!panel) return;
  const cfg = {
    earthquake: '🌍',
    flood: '🌊',
    storm: '🌪️',
    fire: '🔥',
    landslide: '⛰️',
    tsunami: '🌊',
    other: '⚠️'
  };
  const icon = cfg[d.type] || '⚠️';

  panel.innerHTML = `
    <div class="mdp-content">
      <div class="mdp-header">
        <span class="mdp-icon">${icon}</span>
        <div>
          <div class="mdp-title">${d.title || DW.capitalize(d.type)}</div>
          <div class="mdp-location">${d.location} &bull; Coordinates: ${d.lat.toFixed(3)}°N, ${d.lng.toFixed(3)}°E</div>
        </div>
        <div class="sev-badge-${d.severity} mdp-sev">${(d.severity || 'ACTIVE').toUpperCase()}</div>
      </div>
      <div class="mdp-stats">
        <div class="mdp-stat"><div class="mono">${d.time || 'Recent'}</div><div>Reported</div></div>
        <div class="mdp-stat"><div class="mono">${d.affected ? d.affected.toLocaleString() : 'N/A'}</div><div>Affected</div></div>
        <div class="mdp-stat"><div class="mono">${(d.status || 'Active').toUpperCase()}</div><div>Status</div></div>
        ${d.magnitude ? `<div class="mdp-stat"><div class="mono">M${d.magnitude}</div><div>Magnitude</div></div>` : ''}
      </div>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button class="btn-mini" onclick="DW.showToast('Response alert acknowledged for ${d.location}', 'success')">Acknowledge</button>
        <button class="btn-mini btn-outline" onclick="DW.showToast('Dispatching regional NDRF/SDRF team to ${d.location}...', 'info')">Dispatch Rescue</button>
      </div>
    </div>
  `;
}

// ─── Alerts Table ─────────────────────────────────────────────────────────────
let cachedAlertEvents = [];

async function renderAlerts(filter) {
  const tbody = document.getElementById('alertsTableBody');
  const label = document.getElementById('alertsCountLabel');
  if (!tbody) return;

  // Use events already loaded into DisasterMap or fetch fresh
  let events = window.DisasterMap ? DisasterMap.getVerifiedEvents() : [];
  if (events.length === 0) {
    try {
      let res;
      try {
        res = await fetch('/api/v1/hazards/live?timeframe=24h&type=all');
        if (!res.ok) throw new Error('Proxy error');
      } catch (proxyErr) {
        res = await fetch('http://localhost:4000/api/v1/hazards/live?timeframe=24h&type=all');
      }
      if (res.ok) {
        const json = await res.json();
        events = json.data?.events || [];
        cachedAlertEvents = events;
      }
    } catch (e) {
      console.warn('Could not fetch live events for alerts table:', e);
    }
  } else {
    cachedAlertEvents = events;
  }

  const filtered = filter === 'all' ? events
    : events.filter(d => {
        const s = d.severity || 'medium';
        return s === filter;
      });

  if (label) label.textContent = `Showing ${filtered.length} confirmed alerts`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No confirmed disasters reported for this filter right now.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const sev = d.severity || 'medium';
    const timeStr = d.time ? new Date(d.time).toLocaleString() : 'Recent';
    const loc = d.location || d.title || 'See source';
    const locSafe = loc.replace(/'/g, '');
    return `
      <tr class="alert-row sev-row-${sev}">
        <td><span class="sev-badge-${sev}">${sev.toUpperCase()}</span></td>
        <td>${TYPE_EMOJI[d.type] || '⚠️'} ${DW.capitalize(d.type)}</td>
        <td>${loc}</td>
        <td class="mono">${timeStr}</td>
        <td><span class="status-pill status-active">${d.status || 'Active'}</span></td>
        <td>
          ${d.sourceUrl ? `<a href="${d.sourceUrl}" target="_blank" class="btn-mini" rel="noopener">Source ↗</a>` : ''}
          <button class="btn-mini btn-outline" onclick="DW.showToast('Acknowledged: ${locSafe}', 'success')">ACK</button>
        </td>
      </tr>
    `;
  }).join('');
}

document.querySelectorAll('#alertFilters .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#alertFilters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderAlerts(chip.dataset.type);
  });
});

// ─── Community Reports ────────────────────────────────────────────────────────
const communityReportsList = JSON.parse(localStorage.getItem('dw_reports') || '[]');

function renderCommunityReports() {
  const container = document.getElementById('communityReports');
  if (!container) return;
  if (communityReportsList.length === 0) {
    container.innerHTML = '<p class="no-data">No community reports yet. Submit the first one!</p>';
    return;
  }
  container.innerHTML = communityReportsList.slice().reverse().map(r => `
    <div class="cr-item">
      <div class="cr-header">
        <span class="cr-type">${TYPE_EMOJI[r.type] || '⚠️'} ${DW.capitalize(r.type)}</span>
        <span class="sev-badge-${r.severity}">${r.severity.toUpperCase()}</span>
      </div>
      <div class="cr-location">${r.location}</div>
      <div class="cr-desc">${r.desc}</div>
      <div class="cr-meta mono">${r.time} · ${parseInt(r.pop || 0).toLocaleString()} affected</div>
    </div>
  `).join('');
}

document.getElementById('reportForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const type = document.getElementById('rType').value;
  const severity = document.getElementById('rSeverity').value;
  const location = document.getElementById('rLocation').value;
  const desc = document.getElementById('rDesc').value;
  const pop = document.getElementById('rPop').value;

  if (!type || !severity || !location || !desc) {
    DW.showToast('Please fill in all required fields', 'error');
    return;
  }

  const report = { type, severity, location, desc, pop, time: 'Just now', id: Date.now() };
  communityReportsList.push(report);
  localStorage.setItem('dw_reports', JSON.stringify(communityReportsList));

  document.getElementById('reportForm').reset();
  renderCommunityReports();
  DW.showToast('Report submitted successfully!', 'success');

  // Update alert badge
  const badge = document.getElementById('alertBadge');
  if (badge) badge.textContent = parseInt(badge.textContent) + 1;
});

// ─── Analytics View ───────────────────────────────────────────────────────────
function renderAnalytics() {
  renderMonthlyBars();
  renderTypeDonut();
  renderRegionList();
  renderTrendChart();
}

function renderMonthlyBars() {
  const el = document.getElementById('monthlyBars');
  if (!el) return;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const data = [42,38,55,61,48,70,85,78,66,54,47,82];
  const max = Math.max(...data);
  el.innerHTML = `
    <div class="monthly-bar-chart">
      ${months.map((m, i) => `
        <div class="mbc-col">
          <div class="mbc-val mono">${data[i]}</div>
          <div class="mbc-bar-wrap">
            <div class="mbc-bar" style="height:${(data[i]/max)*100}%"></div>
          </div>
          <div class="mbc-label">${m}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTypeDonut() {
  const el = document.getElementById('typeDonut');
  if (!el) return;
  const types = [
    { label: 'Floods', pct: 35, color: '#3B82F6' },
    { label: 'Earthquakes', pct: 28, color: '#FF3B3B' },
    { label: 'Storms', pct: 22, color: '#FFD600' },
    { label: 'Fires', pct: 10, color: '#FF8C00' },
    { label: 'Other', pct: 5, color: '#6B7280' },
  ];
  let offset = 0;
  const r = 60, cx = 80, cy = 80;
  const circumference = 2 * Math.PI * r;
  const segs = types.map(t => {
    const len = (t.pct / 100) * circumference;
    const gap = circumference - len;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.color}" stroke-width="24"
      stroke-dasharray="${len} ${gap}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return seg;
  }).join('');

  el.innerHTML = `
    <div class="donut-wrap">
      <svg width="160" height="160" viewBox="0 0 160 160">${segs}
        <text x="${cx}" y="${cy+5}" text-anchor="middle" fill="var(--text-primary)" font-size="14" font-family="Bebas Neue">726</text>
        <text x="${cx}" y="${cy+18}" text-anchor="middle" fill="var(--text-muted)" font-size="8">TOTAL</text>
      </svg>
      <div class="donut-legend">
        ${types.map(t => `<div class="dl-item"><span style="background:${t.color}"></span>${t.label} (${t.pct}%)</div>`).join('')}
      </div>
    </div>
  `;
}

function renderRegionList() {
  const el = document.getElementById('regionList');
  if (!el) return;
  const regions = [
    { name: 'Southeast Asia', events: 142, delta: '+12%' },
    { name: 'South Asia', events: 118, delta: '+8%' },
    { name: 'Western USA', events: 94, delta: '+3%' },
    { name: 'Caribbean', events: 76, delta: '-5%' },
    { name: 'East Africa', events: 63, delta: '+15%' },
    { name: 'Mediterranean', events: 55, delta: '-2%' },
  ];
  el.innerHTML = regions.map((r, i) => `
    <div class="rl-item">
      <span class="rl-rank mono">${String(i+1).padStart(2,'0')}</span>
      <span class="rl-name">${r.name}</span>
      <span class="rl-events mono">${r.events}</span>
      <span class="rl-delta ${r.delta.startsWith('+') ? 'up' : 'down'}">${r.delta}</span>
    </div>
  `).join('');
}

function renderTrendChart() {
  const el = document.getElementById('trendChart');
  if (!el) return;
  const data = [42,38,55,61,48,70,85,78,66,54,47,82];
  const max = Math.max(...data);
  const w = 400, h = 100;
  const pts = data.map((v, i) => `${(i/(data.length-1))*w},${h - (v/max)*h}`).join(' ');
  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="trend-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${pts} ${w},${h} 0,${h}" fill="url(#trendGrad)"/>
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      ${data.map((v,i) => `<circle cx="${(i/(data.length-1))*w}" cy="${h-(v/max)*h}" r="3" fill="var(--accent)"/>`).join('')}
    </svg>
  `;
}

// ─── Global Search ────────────────────────────────────────────────────────────
document.getElementById('globalSearch')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) return;
  // Search live events cached from the map or alerts
  const events = (window.DisasterMap ? DisasterMap.getVerifiedEvents() : []).concat(cachedAlertEvents || []);
  const match = events.find(d =>
    (d.location || '').toLowerCase().includes(q) ||
    (d.title || '').toLowerCase().includes(q) ||
    (d.type || '').toLowerCase().includes(q)
  );
  if (match) {
    switchView('alerts');
    setTimeout(() => {
      const rows = document.querySelectorAll('.alert-row');
      rows.forEach(r => r.classList.remove('highlight'));
      for (const row of rows) {
        if (row.textContent.toLowerCase().includes(q)) {
          row.classList.add('highlight');
          row.scrollIntoView({ behavior: 'smooth' });
          break;
        }
      }
    }, 300);
  } else if (window.DisasterMap) {
    switchView('map');
    setTimeout(() => DisasterMap.searchPlace(q), 150);
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────
renderDashboard();
DW.showToast('⚡ DisasterWatch online — connecting to live global feeds…', 'info');
