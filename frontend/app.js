/**
 * app.js — DisasterWatch Main Application Logic
 */

// ─── Auth Guard ─────────────────────────────────────────────────────────────
(function authGuard() {
  const user = DW.storage.getUser();
  if (!user) { window.location.href = 'login.html'; return; }
  const info = document.getElementById('userInfo');
  if (info) {
    info.querySelector('.user-name').textContent = user.name || user.id;
    info.querySelector('.user-avatar').textContent = (user.name || user.id)[0].toUpperCase();
  }
})();

// ─── Logout ──────────────────────────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  DW.storage.clearUser();
  window.location.href = 'login.html';
});

// ─── Live Clock ──────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('liveClock');
  if (el) el.textContent = new Date().toUTCString().slice(17, 25) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// ─── Sidebar Toggle ──────────────────────────────────────────────────────────
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
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

// ─── Mock Data ───────────────────────────────────────────────────────────────
const DISASTERS = [
  { id: 1, type: 'earthquake', severity: 'critical', location: 'Tokyo, Japan', lat: 35.6, lon: 720, time: '2h ago', status: 'active', magnitude: 6.8, affected: 12000 },
  { id: 2, type: 'flood', severity: 'high', location: 'Chennai, India', lat: 13.0, lon: 555, time: '4h ago', status: 'active', magnitude: null, affected: 45000 },
  { id: 3, type: 'storm', severity: 'critical', location: 'Gulf of Mexico', lat: 25.0, lon: 170, time: '1h ago', status: 'active', magnitude: null, affected: 80000 },
  { id: 4, type: 'fire', severity: 'high', location: 'California, USA', lat: 36.7, lon: 130, time: '6h ago', status: 'monitoring', magnitude: null, affected: 3200 },
  { id: 5, type: 'earthquake', severity: 'medium', location: 'Istanbul, Turkey', lat: 41.0, lon: 450, time: '8h ago', status: 'resolved', magnitude: 4.2, affected: 500 },
  { id: 6, type: 'flood', severity: 'medium', location: 'Bangladesh', lat: 23.6, lon: 565, time: '12h ago', status: 'active', magnitude: null, affected: 25000 },
  { id: 7, type: 'landslide', severity: 'high', location: 'Nepal', lat: 28.1, lon: 565, time: '3h ago', status: 'active', magnitude: null, affected: 1200 },
  { id: 8, type: 'tsunami', severity: 'critical', location: 'Philippines', lat: 12.8, lon: 680, time: '30m ago', status: 'active', magnitude: null, affected: 30000 },
  { id: 9, type: 'storm', severity: 'low', location: 'Caribbean', lat: 17.0, lon: 155, time: '14h ago', status: 'monitoring', magnitude: null, affected: 2000 },
  { id: 10, type: 'fire', severity: 'medium', location: 'Australia', lat: 360, lon: 720, time: '5h ago', status: 'monitoring', magnitude: null, affected: 800 },
  { id: 11, type: 'earthquake', severity: 'low', location: 'Mexico City', lat: 19.4, lon: 115, time: '18h ago', status: 'resolved', magnitude: 3.1, affected: 0 },
  { id: 12, type: 'flood', severity: 'critical', location: 'Pakistan', lat: 30.3, lon: 565, time: '7h ago', status: 'active', magnitude: null, affected: 120000 },
];

const TYPE_EMOJI = { earthquake: '🌍', flood: '🌊', storm: '🌪️', fire: '🔥', landslide: '⛰️', tsunami: '🌊', other: '⚠️' };
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

  try {
    const response = await DW.api.get('/hazards?perPage=6&sortBy=occurredAt&order=desc');
    const recent = response.data || [];

    list.innerHTML = recent.map(d => {
      const severity = d.riskLevel || 'medium'; // Map riskLevel to severity
      const location = d.place || `${d.latitude.toFixed(1)}, ${d.longitude.toFixed(1)}`;
      const time = DW.timeAgo(d.occurredAt);
      const affected = d.riskScore ? Math.round(d.riskScore * 1000) : 0; // Mock affected count

      return `
        <div class="event-item sev-${severity}">
          <div class="ei-icon">${TYPE_EMOJI[d.type] || '⚠️'}</div>
          <div class="ei-body">
            <div class="ei-title">${DW.capitalize(d.type)} — ${location}</div>
            <div class="ei-meta mono">${time} · ${affected.toLocaleString()} affected</div>
          </div>
          <div class="ei-sev sev-badge-${severity}">${severity.toUpperCase()}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load recent events:', error);
    // Fallback to mock data
    const recent = DISASTERS.slice(0, 6);
    list.innerHTML = recent.map(d => `
      <div class="event-item sev-${d.severity}">
        <div class="ei-icon">${TYPE_EMOJI[d.type]}</div>
        <div class="ei-body">
          <div class="ei-title">${DW.capitalize(d.type)} — ${d.location}</div>
          <div class="ei-meta mono">${d.time} · ${d.affected.toLocaleString()} affected</div>
        </div>
        <div class="ei-sev sev-badge-${d.severity}">${d.severity.toUpperCase()}</div>
      </div>
    `).join('');
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
  const container = document.getElementById('mapMarkers');
  if (!container) return;

  const filtered = activeFilter === 'all' ? DISASTERS : DISASTERS.filter(d => d.type === activeFilter);

  // Map coordinate transform (simplified equirectangular projection for our SVG)
  // SVG viewBox 0 0 900 500
  // Lat range: -60 to 80 → y 450 to 50
  // Lon range: -180 to 180 → x 0 to 900
  container.innerHTML = filtered.map(d => {
    const x = (d.lon / 900 * 900); // lon stored as 0-900 range in mock
    const y = d.lat * 4; // simplified
    const color = SEV_COLORS[d.severity];
    return `
      <div class="map-marker sev-${d.severity}"
           style="left:${d.lon * 0.98}px; top:${d.lat * 3.6}px; border-color:${color}"
           data-id="${d.id}" title="${TYPE_EMOJI[d.type]} ${d.location}">
        <span>${TYPE_EMOJI[d.type]}</span>
        <div class="marker-pulse" style="border-color:${color}"></div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.map-marker').forEach(m => {
    m.addEventListener('click', () => {
      const id = parseInt(m.dataset.id);
      const d = DISASTERS.find(x => x.id === id);
      if (d) showMapDetail(d);
    });
  });
}

function showMapDetail(d) {
  const panel = document.getElementById('mapDetailPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="mdp-content">
      <div class="mdp-header">
        <span class="mdp-icon">${TYPE_EMOJI[d.type]}</span>
        <div>
          <div class="mdp-title">${DW.capitalize(d.type)}</div>
          <div class="mdp-location">${d.location}</div>
        </div>
        <div class="sev-badge-${d.severity} mdp-sev">${d.severity.toUpperCase()}</div>
      </div>
      <div class="mdp-stats">
        <div class="mdp-stat"><div class="mono">${d.time}</div><div>Reported</div></div>
        <div class="mdp-stat"><div class="mono">${d.affected.toLocaleString()}</div><div>Affected</div></div>
        <div class="mdp-stat"><div class="mono">${d.status.toUpperCase()}</div><div>Status</div></div>
        ${d.magnitude ? `<div class="mdp-stat"><div class="mono">M${d.magnitude}</div><div>Magnitude</div></div>` : ''}
      </div>
      <button class="btn-mini" onclick="DW.showToast('Alert acknowledged', 'success')">Acknowledge</button>
    </div>
  `;
}

document.querySelectorAll('.map-ctrl').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.map-ctrl').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderMap();
  });
});

// ─── Alerts Table ─────────────────────────────────────────────────────────────
function renderAlerts(filter) {
  const tbody = document.getElementById('alertsTableBody');
  const label = document.getElementById('alertsCountLabel');
  if (!tbody) return;

  const filtered = filter === 'all' ? DISASTERS : DISASTERS.filter(d => d.severity === filter);
  if (label) label.textContent = `Showing ${filtered.length} alerts`;

  tbody.innerHTML = filtered.map(d => `
    <tr class="alert-row sev-row-${d.severity}">
      <td><span class="sev-badge-${d.severity}">${d.severity.toUpperCase()}</span></td>
      <td>${TYPE_EMOJI[d.type]} ${DW.capitalize(d.type)}</td>
      <td>${d.location}</td>
      <td class="mono">${d.time}</td>
      <td><span class="status-pill status-${d.status}">${d.status}</span></td>
      <td>
        <button class="btn-mini" onclick="DW.showToast('Acknowledged: ${d.location}', 'success')">ACK</button>
        <button class="btn-mini btn-outline" onclick="DW.showToast('Dispatching response team to ${d.location}...', 'info')">DISPATCH</button>
      </td>
    </tr>
  `).join('');
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
  const q = e.target.value.toLowerCase();
  if (!q) return;
  const match = DISASTERS.find(d => d.location.toLowerCase().includes(q) || d.type.includes(q));
  if (match) {
    switchView('alerts');
    setTimeout(() => {
      const rows = document.querySelectorAll('.alert-row');
      rows.forEach(r => r.classList.remove('highlight'));
      const row = document.querySelector(`.alert-row:nth-child(${DISASTERS.indexOf(match) + 1})`);
      if (row) { row.classList.add('highlight'); row.scrollIntoView({ behavior: 'smooth' }); }
    }, 100);
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────
renderDashboard();
DW.showToast('⚡ System online — 247 active global alerts', 'info');

// Periodic mock alert
setTimeout(() => {
  DW.showToast('🌊 NEW: Flood warning issued — Bangladesh (Critical)', 'error');
}, 8000);
