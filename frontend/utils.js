/**
 * utils.js — DisasterWatch Utility Library
 * Shared helpers used across the app
 */

const DW = (() => {

  // ─── String Helpers ──────────────────────────────────────────────────────
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatNumber(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  function timeAgo(date) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // ─── DOM Helpers ─────────────────────────────────────────────────────────
  function $(selector, parent = document) {
    return parent.querySelector(selector);
  }

  function $$(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  function createElement(tag, classes = [], attrs = {}) {
    const el = document.createElement(tag);
    if (classes.length) el.classList.add(...classes);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // ─── Toast Notifications ─────────────────────────────────────────────────
  /**
   * showToast(message, type)
   * type: 'info' | 'success' | 'error' | 'warning'
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      info: '📡',
      success: '✅',
      error: '🚨',
      warning: '⚠️'
    };

    const toast = createElement('div', ['toast', `toast-${type}`]);
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || '📡'}</span>
      <span class="toast-msg">${message}</span>
      <button class="toast-close">✕</button>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));

    // Auto-remove after 5s
    const timer = setTimeout(() => removeToast(toast), 5000);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      removeToast(toast);
    });
  }

  function removeToast(toast) {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }

  // ─── Local Storage Helpers ────────────────────────────────────────────────
  const storage = {
    getUser() {
      try { return JSON.parse(localStorage.getItem('dw_user')); }
      catch { return null; }
    },
    setUser(user) {
      localStorage.setItem('dw_user', JSON.stringify(user));
    },
    clearUser() {
      localStorage.removeItem('dw_user');
    },
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); }
      catch { return null; }
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
      localStorage.removeItem(key);
    }
  };

  // ─── Color Helpers ────────────────────────────────────────────────────────
  const severityColor = {
    critical: '#FF3B3B',
    high: '#FF8C00',
    medium: '#FFD600',
    low: '#4CAF50',
    unknown: '#6B7280'
  };

  function getSeverityColor(level) {
    return severityColor[level] || severityColor.unknown;
  }

  // ─── API Helpers ──────────────────────────────────────────────────────────
  /**
   * Generic fetch wrapper with error handling.
   * Usage: await DW.api.get('/endpoint')
   *        await DW.api.post('/endpoint', { body data })
   */
  const api = {
    BASE: window.API_BASE_URL || 'http://localhost:4000/api/v1',

    async get(path) {
      const token = storage.get('dw_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(this.BASE + path, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },

    async post(path, data) {
      const token = storage.get('dw_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(this.BASE + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
  };

  // ─── Export ───────────────────────────────────────────────────────────────
  return {
    capitalize, formatNumber, timeAgo,
    $, $$, createElement, clearElement,
    showToast,
    storage,
    getSeverityColor,
    api
  };

})();