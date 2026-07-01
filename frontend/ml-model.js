/**
 * ml-model.js — DisasterWatch ML Risk Prediction Engine
 *
 * Implements a client-side rule-based model for disaster risk assessment.
 * Replace with a real TensorFlow.js or ONNX model for production.
 */

const MLModel = (() => {

  // ─── Feature Definitions ─────────────────────────────────────────────────
  const FEATURES = [
    {
      id: 'rainfall', label: 'Rainfall (mm/day)', type: 'number',
      min: 0, max: 600, placeholder: 'e.g. 120',
      tooltip: '24-hour accumulated rainfall in millimetres'
    },
    {
      id: 'seismic', label: 'Seismic Activity (0–10)', type: 'number',
      min: 0, max: 10, step: 0.1, placeholder: 'e.g. 3.5',
      tooltip: 'Recent seismic activity index (0 = none, 10 = extreme)'
    },
    {
      id: 'windspeed', label: 'Wind Speed (km/h)', type: 'number',
      min: 0, max: 400, placeholder: 'e.g. 85',
      tooltip: 'Maximum sustained wind speed'
    },
    {
      id: 'temperature', label: 'Temperature (°C)', type: 'number',
      min: -30, max: 60, placeholder: 'e.g. 38',
      tooltip: 'Current temperature in Celsius'
    },
    {
      id: 'humidity', label: 'Humidity (%)', type: 'number',
      min: 0, max: 100, placeholder: 'e.g. 90',
      tooltip: 'Relative humidity percentage'
    },
    {
      id: 'elevation', label: 'Elevation (m)', type: 'number',
      min: -500, max: 8500, placeholder: 'e.g. 200',
      tooltip: 'Terrain elevation above sea level'
    },
    {
      id: 'coastDistance', label: 'Distance to Coast (km)', type: 'number',
      min: 0, max: 3000, placeholder: 'e.g. 15',
      tooltip: 'Distance from the nearest coastline'
    },
    {
      id: 'region', label: 'Region Type', type: 'select',
      options: [
        { value: '', label: 'Select region type...' },
        { value: 'coastal', label: 'Coastal / Island' },
        { value: 'riverine', label: 'Riverine / Floodplain' },
        { value: 'mountain', label: 'Mountain / Highland' },
        { value: 'arid', label: 'Arid / Desert' },
        { value: 'urban', label: 'Dense Urban' },
        { value: 'forest', label: 'Forest / Wildland' },
        { value: 'plains', label: 'Plains / Lowland' },
      ],
      tooltip: 'Geographical classification of the area'
    }
  ];

  // ─── Weights (per disaster type) ─────────────────────────────────────────
  // Each entry: feature contribution weights on a 0–1 normalised basis
  const MODELS = {
    flood: {
      name: 'Flood Risk',
      icon: '🌊',
      compute(f) {
        const r = norm(f.rainfall, 0, 600) * 0.40;
        const h = norm(f.humidity, 0, 100) * 0.15;
        const e = (1 - norm(f.elevation, 0, 500)) * 0.15;
        const c = (1 - norm(f.coastDistance, 0, 200)) * 0.15;
        const reg = f.region === 'coastal' || f.region === 'riverine' ? 0.15 : 0;
        return clamp(r + h + e + c + reg);
      }
    },
    earthquake: {
      name: 'Earthquake Risk',
      icon: '🌍',
      compute(f) {
        const s = norm(f.seismic, 0, 10) * 0.70;
        const reg = f.region === 'mountain' ? 0.10 : 0;
        const e = norm(f.elevation, 0, 5000) * 0.10;
        return clamp(s + reg + e);
      }
    },
    storm: {
      name: 'Storm / Cyclone Risk',
      icon: '🌪️',
      compute(f) {
        const w = norm(f.windspeed, 0, 400) * 0.45;
        const r = norm(f.rainfall, 0, 400) * 0.20;
        const c = (1 - norm(f.coastDistance, 0, 500)) * 0.20;
        const h = norm(f.humidity, 60, 100) * 0.10;
        const reg = f.region === 'coastal' ? 0.05 : 0;
        return clamp(w + r + c + h + reg);
      }
    },
    fire: {
      name: 'Wildfire Risk',
      icon: '🔥',
      compute(f) {
        const t = norm(f.temperature, 20, 55) * 0.35;
        const h = (1 - norm(f.humidity, 0, 100)) * 0.30;
        const w = norm(f.windspeed, 0, 200) * 0.20;
        const reg = f.region === 'forest' || f.region === 'arid' ? 0.15 : 0;
        return clamp(t + h + w + reg);
      }
    },
    landslide: {
      name: 'Landslide Risk',
      icon: '⛰️',
      compute(f) {
        const r = norm(f.rainfall, 0, 500) * 0.35;
        const e = norm(f.elevation, 500, 4000) * 0.30;
        const s = norm(f.seismic, 0, 10) * 0.20;
        const reg = f.region === 'mountain' ? 0.15 : 0;
        return clamp(r + e + s + reg);
      }
    }
  };

  // ─── Math Helpers ─────────────────────────────────────────────────────────
  function norm(val, min, max) {
    if (val === '' || val === null || val === undefined) return 0;
    return Math.max(0, Math.min(1, (parseFloat(val) - min) / (max - min)));
  }

  function clamp(val, lo = 0, hi = 1) {
    return Math.max(lo, Math.min(hi, val));
  }

  function scoreToLevel(score) {
    if (score >= 0.75) return { level: 'critical', label: 'Critical', color: '#FF3B3B' };
    if (score >= 0.50) return { level: 'high',     label: 'High',     color: '#FF8C00' };
    if (score >= 0.25) return { level: 'medium',   label: 'Medium',   color: '#FFD600' };
    return                     { level: 'low',     label: 'Low',      color: '#4CAF50' };
  }

  // ─── Run Prediction ───────────────────────────────────────────────────────
  function predict(features) {
    const results = Object.entries(MODELS).map(([key, model]) => {
      const score = model.compute(features);
      const { level, label, color } = scoreToLevel(score);
      return { key, name: model.name, icon: model.icon, score, level, label, color };
    });
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  // ─── Feature Importance ───────────────────────────────────────────────────
  function featureImportance(features, modelKey) {
    const model = MODELS[modelKey];
    if (!model) return [];
    const base = model.compute(features);
    const featureIds = ['rainfall','seismic','windspeed','temperature','humidity','elevation','coastDistance'];

    return featureIds.map(fid => {
      const perturbed = { ...features, [fid]: 0 };
      const impact = base - model.compute(perturbed);
      return { feature: fid, impact: Math.max(0, impact) };
    }).sort((a, b) => b.impact - a.impact);
  }

  // ─── Render Form ──────────────────────────────────────────────────────────
  function renderForm() {
    const container = document.getElementById('mlFormContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="ml-features">
        ${FEATURES.map(f => `
          <div class="form-group">
            <label class="form-label" title="${f.tooltip || ''}">${f.label}</label>
            ${f.type === 'select' ? `
              <select class="form-input" id="ml_${f.id}">
                ${f.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
              </select>
            ` : `
              <input type="number" class="form-input" id="ml_${f.id}"
                placeholder="${f.placeholder || ''}"
                min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step || 'any'}"/>
            `}
          </div>
        `).join('')}
      </div>
      <button class="btn-submit" id="runPrediction">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        RUN PREDICTION
      </button>
    `;

    document.getElementById('runPrediction').addEventListener('click', runPrediction);
  }

  function getFormValues() {
    const features = {};
    FEATURES.forEach(f => {
      const el = document.getElementById(`ml_${f.id}`);
      features[f.id] = el ? el.value : '';
    });
    return features;
  }

  function runPrediction() {
    const features = getFormValues();

    // Basic validation
    const numericFilled = FEATURES.filter(f => f.type === 'number').some(f => features[f.id] !== '');
    if (!numericFilled) {
      DW.showToast('Please enter at least some environmental data', 'warning');
      return;
    }

    const results = predict(features);
    const topModel = results[0];
    const importance = featureImportance(features, topModel.key);

    renderResults(results, importance, features);
  }

  // ─── Render Results ───────────────────────────────────────────────────────
  function renderResults(results, importance, features) {
    const panel = document.getElementById('predictResult');
    if (!panel) return;

    const top = results[0];

    panel.innerHTML = `
      <div class="predict-results">
        <div class="pr-top-risk">
          <div class="pr-icon">${top.icon}</div>
          <div class="pr-info">
            <div class="pr-label">Highest Risk</div>
            <div class="pr-name">${top.name}</div>
            <div class="pr-score-label">Risk Score</div>
            <div class="pr-score-bar">
              <div class="pr-score-fill" style="width:${(top.score*100).toFixed(0)}%;background:${top.color}"></div>
            </div>
            <div class="pr-pct mono">${(top.score*100).toFixed(1)}% — <span class="sev-badge-${top.level}">${top.label}</span></div>
          </div>
        </div>

        <div class="pr-all-risks">
          <h3 class="section-subtitle">ALL RISK TYPES</h3>
          ${results.map(r => `
            <div class="pr-risk-row">
              <span class="pr-rr-icon">${r.icon}</span>
              <span class="pr-rr-name">${r.name}</span>
              <div class="pr-rr-bar-wrap">
                <div class="pr-rr-bar" style="width:${(r.score*100).toFixed(0)}%;background:${r.color}"></div>
              </div>
              <span class="pr-rr-pct mono">${(r.score*100).toFixed(0)}%</span>
            </div>
          `).join('')}
        </div>

        <div class="pr-importance">
          <h3 class="section-subtitle">KEY RISK DRIVERS</h3>
          ${importance.slice(0, 4).map(f => `
            <div class="pr-fi-row">
              <span class="pr-fi-label">${DW.capitalize(f.feature)}</span>
              <div class="pr-fi-bar-wrap">
                <div class="pr-fi-bar" style="width:${(f.impact / (importance[0].impact || 1) * 100).toFixed(0)}%"></div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="pr-recommendations">
          <h3 class="section-subtitle">RECOMMENDATIONS</h3>
          <ul class="rec-list">
            ${getRecommendations(top.key, top.level).map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>

        <button class="btn-mini" onclick="MLModel.exportResult()">Export Report</button>
      </div>
    `;
  }

  // ─── Recommendations ──────────────────────────────────────────────────────
  function getRecommendations(type, level) {
    const recs = {
      flood: {
        critical: ['Initiate immediate evacuation of low-lying areas', 'Deploy emergency flood barriers', 'Alert rescue teams and pre-position boats', 'Issue public emergency broadcast'],
        high: ['Issue flood watch advisory', 'Prepare evacuation routes and shelters', 'Monitor river gauges every 30 minutes'],
        medium: ['Monitor rainfall accumulation', 'Clear drainage systems', 'Alert local emergency management'],
        low: ['Continue standard monitoring', 'Review flood preparedness plans']
      },
      earthquake: {
        critical: ['Activate seismic response protocol', 'Deploy urban search and rescue teams', 'Establish emergency command centers', 'Inspect critical infrastructure immediately'],
        high: ['Issue aftershock warning', 'Assess structural damage', 'Open emergency shelters'],
        medium: ['Inspect vulnerable buildings', 'Alert civil engineering teams'],
        low: ['Log seismic activity', 'Routine inspection schedule']
      },
      storm: {
        critical: ['Issue mandatory evacuation orders', 'Close ports and airports', 'Activate national emergency response', 'Pre-position relief supplies'],
        high: ['Issue storm surge warnings', 'Secure loose structures', 'Open storm shelters'],
        medium: ['Issue weather advisory', 'Restrict outdoor activities', 'Monitor storm track'],
        low: ['Continue weather monitoring', 'Public awareness messaging']
      },
      fire: {
        critical: ['Declare fire emergency zone', 'Deploy aerial firefighting units', 'Mandatory evacuation of fire-risk zones', 'Request interstate mutual aid'],
        high: ['Issue red flag warning', 'Pre-position fire crews', 'Restrict open burning'],
        medium: ['Increase fire patrol frequency', 'Public fire safety advisory'],
        low: ['Enforce burn bans as needed', 'Community fire prevention outreach']
      },
      landslide: {
        critical: ['Evacuate unstable slopes immediately', 'Close mountain roads and passes', 'Deploy geotechnical emergency teams'],
        high: ['Issue landslide watch', 'Monitor slope sensors', 'Restrict hillside development activity'],
        medium: ['Inspect retaining walls and drains', 'Issue resident advisory'],
        low: ['Continue slope stability monitoring']
      }
    };
    return (recs[type] && recs[type][level]) || ['Continue standard monitoring procedures.'];
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  function exportResult() {
    const features = getFormValues();
    const results = predict(features);
    const top = results[0];
    const timestamp = new Date().toISOString();

    const report = {
      generated: timestamp,
      operator: DW.storage.getUser()?.name || 'Unknown',
      inputFeatures: features,
      predictions: results.map(r => ({
        type: r.name, score: (r.score * 100).toFixed(1) + '%', level: r.label
      })),
      primaryThreat: top.name,
      recommendations: getRecommendations(top.key, top.level)
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disasterwatch-risk-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    DW.showToast('Risk report exported', 'success');
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return { renderForm, predict, exportResult };

})();
