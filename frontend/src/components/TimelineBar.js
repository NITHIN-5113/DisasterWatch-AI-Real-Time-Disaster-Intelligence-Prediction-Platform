// frontend/src/components/TimelineBar.js
// DisasterWatch — Floating Bottom Timeline Control for Satellite & Radar Playback

'use strict';

const TimelineBar = (() => {
  let containerEl = null;
  let playInterval = null;

  function render(containerId = 'timelineRoot') {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    const I = window.DWIcons;

    containerEl.innerHTML = `
      <div class="dw-timeline-bar" id="dwTimelineBar">
        <!-- Play / Pause -->
        <button type="button" class="dw-tb-btn dw-tb-play" id="tbPlayBtn" title="Play / Pause animation">
          ${I.get('play')}
        </button>

        <!-- Step Back -->
        <button type="button" class="dw-tb-btn" id="tbStepBack" title="Step backward 10 min">
          ${I.get('stepBack')}
        </button>

        <!-- Date Pill -->
        <div class="dw-tb-date-pill" id="tbDatePill">
          <span class="dw-tb-date-val" id="tbDateText">-- ---</span>
        </div>

        <!-- Hour : Minute Pill -->
        <div class="dw-tb-time-pill" id="tbTimePill">
          <span class="dw-tb-time-val mono" id="tbTimeText">-- : --</span>
        </div>

        <!-- Step Forward -->
        <button type="button" class="dw-tb-btn" id="tbStepForward" title="Step forward 10 min">
          ${I.get('stepForward')}
        </button>

        <!-- UTC / Local Time Toggle Pill -->
        <button type="button" class="dw-tb-tz-toggle" id="tbTzToggle" title="Toggle UTC vs Local Time">
          <span id="tbTzLabel">UTC</span>
        </button>

        <!-- Timeline Frame Scrubber Slider -->
        <div class="dw-tb-scrubber-wrap">
          <input type="range" class="dw-tb-scrubber" id="tbScrubber" min="0" max="0" value="0" step="1"/>
          <div class="dw-tb-frame-ticks" id="tbFrameTicks"></div>
        </div>
      </div>
    `;

    setupEvents();
    setupSubscriptions();
    loadRadarFrames();
  }

  async function loadRadarFrames() {
    try {
      const res = await fetch('/api/v1/hazards/radar-frames');
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data;
      if (!data || !data.frames || data.frames.length === 0) return;

      const timelineState = DWState.get('timeline');
      timelineState.frames = data.frames;
      timelineState.currentIndex = data.currentFrameIndex ?? (data.frames.length - 1);
      DWState.set('timeline', timelineState);
      DWState.set('radarMetadata', data);

      updateScrubberBounds(data.frames.length);
      syncDisplay();
    } catch (err) {
      console.warn('Failed to load radar frames:', err);
    }
  }

  function updateScrubberBounds(count) {
    const scrubber = document.getElementById('tbScrubber');
    if (!scrubber) return;
    scrubber.max = Math.max(0, count - 1);
    scrubber.value = DWState.get('timeline').currentIndex;

    const ticksEl = document.getElementById('tbFrameTicks');
    if (ticksEl) {
      ticksEl.innerHTML = Array.from({ length: count }, (_, i) => `<span class="dw-tb-tick ${i === count - 1 ? 'latest' : ''}"></span>`).join('');
    }
  }

  function syncDisplay() {
    const { frames, currentIndex, isPlaying } = DWState.get('timeline');
    if (!frames || frames.length === 0 || !frames[currentIndex]) return;

    const frame = frames[currentIndex];
    const tzMode = DWState.get('timeFormat') || 'UTC';
    const date = new Date(frame.time * 1000);

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    let dateStr = '';
    let timeStr = '';

    if (tzMode === 'UTC') {
      dateStr = `${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
      timeStr = `${String(date.getUTCHours()).padStart(2, '0')} : ${String(date.getUTCMinutes()).padStart(2, '0')}`;
    } else {
      dateStr = `${date.getDate()} ${months[date.getMonth()]}`;
      timeStr = `${String(date.getHours()).padStart(2, '0')} : ${String(date.getMinutes()).padStart(2, '0')}`;
    }

    const dateTextEl = document.getElementById('tbDateText');
    const timeTextEl = document.getElementById('tbTimeText');
    const scrubber = document.getElementById('tbScrubber');
    const playBtn = document.getElementById('tbPlayBtn');
    const tzLabel = document.getElementById('tbTzLabel');

    if (dateTextEl) dateTextEl.textContent = dateStr;
    if (timeTextEl) timeTextEl.textContent = timeStr;
    if (scrubber) scrubber.value = currentIndex;
    if (tzLabel) tzLabel.textContent = tzMode;
    if (playBtn) {
      playBtn.innerHTML = isPlaying ? window.DWIcons.get('pause') : window.DWIcons.get('play');
    }

    // If radar overlay is active, push new frame to map
    if (DWState.get('activeWeatherOverlay') === 'radar') {
      window.MapView?.updateRadarFrame(frame);
    }
  }

  function step(delta) {
    const { frames, currentIndex } = DWState.get('timeline');
    if (!frames || frames.length === 0) return;

    let nextIndex = currentIndex + delta;
    if (nextIndex >= frames.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = frames.length - 1;

    DWState.get('timeline').currentIndex = nextIndex;
    syncDisplay();
  }

  function togglePlay() {
    const timelineState = DWState.get('timeline');
    timelineState.isPlaying = !timelineState.isPlaying;

    if (timelineState.isPlaying) {
      // Automatically ensure radar overlay is active if playing
      if (DWState.get('activeWeatherOverlay') !== 'radar') {
        DWState.set('activeWeatherOverlay', 'radar');
      }

      playInterval = setInterval(() => {
        step(1);
      }, timelineState.speedMs || 1200);
    } else {
      clearInterval(playInterval);
      playInterval = null;
    }

    syncDisplay();
  }

  function setupEvents() {
    document.getElementById('tbPlayBtn')?.addEventListener('click', togglePlay);
    document.getElementById('tbStepBack')?.addEventListener('click', () => step(-1));
    document.getElementById('tbStepForward')?.addEventListener('click', () => step(1));

    document.getElementById('tbScrubber')?.addEventListener('input', (e) => {
      const idx = parseInt(e.target.value, 10);
      DWState.get('timeline').currentIndex = idx;
      syncDisplay();
    });

    document.getElementById('tbTzToggle')?.addEventListener('click', () => {
      const current = DWState.get('timeFormat') || 'UTC';
      const next = current === 'UTC' ? 'LOCAL' : 'UTC';
      DWState.setTimeFormat(next);
      syncDisplay();
      DWUtils.showToast(`Display time switched to ${next}`, 'info');
    });
  }

  function setupSubscriptions() {
    DWState.on('change:timeFormat', () => syncDisplay());
    DWState.on('change:activeWeatherOverlay', (overlay) => {
      const bar = document.getElementById('dwTimelineBar');
      if (overlay === 'radar') {
        bar?.classList.add('active-radar');
        syncDisplay();
      } else {
        bar?.classList.remove('active-radar');
      }
    });
  }

  return { render, step, togglePlay };
})();

window.TimelineBar = TimelineBar;
