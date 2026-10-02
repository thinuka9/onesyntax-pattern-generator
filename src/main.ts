/**
 * App shell: owns the single mutable `params`, the on-screen Renderer, the animation loop,
 * keyboard shortcuts, the status line and the `window.__osp` check hook.
 */
import './style.css';
import type { Geometry, Params } from './types';
import { PRESET_NAMES, getPreset, fileBase } from './presets';
import { buildGeometry } from './marks';
import { Renderer, renderToPNG } from './renderer';
import { geometryToSVG } from './svg';
import { buildUI, type Tone, type UI } from './ui';

declare global {
  interface Window {
    __osp?: {
      ready: boolean;
      presets: string[];
      renderPNG(name: string, scale: number, time: number): Promise<string>;
      renderSVG(name: string, time: number): string;
      markCount(name: string, time: number): number;
    };
  }
}

// ─────────────────────────────────────────────────────────── check hook (installed first, so it works even if the UI fails)

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('FileReader failed'));
    r.readAsDataURL(blob);
  });

const hook = {
  ready: false,
  presets: PRESET_NAMES.slice(),
  async renderPNG(name: string, scale: number, time: number): Promise<string> {
    const p = getPreset(name);
    return blobToDataURL(await renderToPNG(buildGeometry(p, time), scale));
  },
  renderSVG(name: string, time: number): string {
    const p = getPreset(name);
    return geometryToSVG(buildGeometry(p, time), fileBase(p));
  },
  markCount(name: string, time: number): number {
    return buildGeometry(getPreset(name), time).count;
  },
};
window.__osp = hook;

// ─────────────────────────────────────────────────────────── state

function initialParams(): Params {
  const q = new URLSearchParams(location.search);
  const want = q.get('preset');
  const name = want && PRESET_NAMES.includes(want) ? want
    : PRESET_NAMES.includes('Sinky Meter') ? 'Sinky Meter' : PRESET_NAMES[0];
  const p = getPreset(name);
  const t = parseFloat(q.get('t') ?? '');
  if (Number.isFinite(t)) p.motion.time = t;
  const paused = q.get('paused');
  if (paused === '1' || paused === 'true') p.motion.playing = false;
  return p;
}

const params: Params = initialParams();

// ─────────────────────────────────────────────────────────── DOM

const stage = document.getElementById('stage') as HTMLElement;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const paneHost = document.getElementById('pane') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const statusMain = statusEl.querySelector('.status-main') as HTMLElement;
const statusMsg = statusEl.querySelector('.status-msg') as HTMLElement;
const stageMsg = document.getElementById('stage-msg') as HTMLElement;

let renderer: Renderer | null = null;
let rendererError: string | null = null;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  rendererError = `Renderer: ${(e as Error).message}`;
  console.error(e);
}

let dirty = true;
let needsResize = true;

// ─────────────────────────────────────────────────────────── status line

let msgTimer = 0;
function message(text: string | null, tone: Tone = 'info') {
  clearTimeout(msgTimer);
  statusMsg.textContent = text ?? '';
  statusMsg.dataset.tone = tone;
  statusMsg.hidden = !text;
  if (text && tone !== 'busy') {
    msgTimer = window.setTimeout(() => { statusMsg.hidden = true; }, tone === 'error' ? 8000 : 3500);
  }
}

let lastMarks = 0;
let lastStrands = 0;
let fps = 0;
let frameError: string | null = null;

function updateStatus() {
  const marks = lastStrands > 0 ? `${lastStrands.toLocaleString('en-US')} strands` : `${lastMarks.toLocaleString('en-US')} marks`;
  const rate = params.motion.playing ? `${Math.round(fps)} fps` : 'paused';
  statusMain.textContent = `seed ${params.seed} · ${marks} · ${rate} · ${params.canvas.width}×${params.canvas.height}`;
  const err = frameError ?? rendererError;
  stageMsg.textContent = err ?? '';
  stageMsg.hidden = !err;
}

// ─────────────────────────────────────────────────────────── sizing

function fitCanvas() {
  const W = Math.max(1, params.canvas.width);
  const H = Math.max(1, params.canvas.height);
  const rect = stage.getBoundingClientRect();
  const pad = Math.max(16, Math.min(48, Math.min(rect.width, rect.height) * 0.05));
  const availW = Math.max(32, rect.width - pad * 2);
  const availH = Math.max(32, rect.height - pad * 2);
  const fit = Math.min(availW / W, availH / H);
  const cssW = Math.max(1, Math.floor(W * fit));
  const cssH = Math.max(1, Math.floor(H * fit));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const dpr = window.devicePixelRatio || 1;
  // Displayed CSS px per logical px × device pixel ratio; cap the backing store at 4096 on the long side.
  let pr = (cssW / W) * dpr;
  pr = Math.min(pr, 4096 / Math.max(W, H));
  if (renderer) {
    try {
      renderer.resize(W, H, pr);
    } catch (e) {
      rendererError = `Renderer resize: ${(e as Error).message}`;
    }
  } else {
    canvas.width = Math.round(W * pr);
    canvas.height = Math.round(H * pr);
  }
  needsResize = false;
  dirty = true;
}

new ResizeObserver(() => { needsResize = true; }).observe(stage);
window.addEventListener('resize', () => { needsResize = true; });

// ─────────────────────────────────────────────────────────── UI

let ui: UI | null = null;
try {
  ui = buildUI(paneHost, params, {
    changed(opts) {
      dirty = true;
      if (opts?.resize) needsResize = true;
    },
    message,
  });
} catch (e) {
  console.error(e);
  message(`UI failed to build: ${(e as Error).message}`, 'error');
}

// ─────────────────────────────────────────────────────────── keyboard

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (ui) ui.togglePlay();
    else { params.motion.playing = !params.motion.playing; dirty = true; }
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    ui?.randomise();
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    void ui?.savePNG();
  }
});

// ─────────────────────────────────────────────────────────── loop

let last = performance.now();
let lastScrubRefresh = 0;
let lastStatus = 0;
let fpsFrames = 0;
let fpsSince = performance.now();
let lastErrMsg = '';

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  if (needsResize) fitCanvas();

  const playing = params.motion.playing;
  if (playing) {
    params.motion.time += dt * params.motion.speed;
    dirty = true;
    if (ui && now - lastScrubRefresh > 250) {
      lastScrubRefresh = now;
      ui.refreshTime();
    }
  }

  if (dirty) {
    dirty = false;
    try {
      const geo: Geometry = buildGeometry(params, params.motion.time);
      lastMarks = geo.count;
      lastStrands = geo.strands.length;
      renderer?.render(geo);
      frameError = null;
      lastErrMsg = '';
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      frameError = msg;
      if (msg !== lastErrMsg) {
        lastErrMsg = msg;
        console.error(e);
      }
    }
    fpsFrames++;
  }

  if (now - fpsSince >= 500) {
    fps = (fpsFrames * 1000) / (now - fpsSince);
    fpsFrames = 0;
    fpsSince = now;
  }
  if (now - lastStatus > 250) {
    lastStatus = now;
    updateStatus();
  }
}

fitCanvas();
updateStatus();
requestAnimationFrame(frame);
hook.ready = true;
