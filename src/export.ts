/**
 * Export / import: PNG, SVG, JSON, clipboard, localStorage presets and WebM recording.
 * Every export goes through buildGeometry, so screen, PNG, SVG and WebM show the same marks.
 */
import type { Params } from './types';
import { buildGeometry } from './marks';
import { Renderer, renderToPNG } from './renderer';
import { geometryToSVG } from './svg';
import { fileBase } from './presets';
import { withDefaults } from './defaults';
import { clone } from './util';

// ─────────────────────────────────────────────────────────── files

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportPNG(params: Params, scale: number): Promise<string> {
  const geo = buildGeometry(params, params.motion.time);
  const blob = await renderToPNG(geo, scale);
  const name = `${fileBase(params)}.png`;
  downloadBlob(blob, name);
  return name;
}

export function exportSVG(params: Params): string {
  const base = fileBase(params);
  const geo = buildGeometry(params, params.motion.time);
  const svg = geometryToSVG(geo, base);
  const name = `${base}.svg`;
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), name);
  return name;
}

export function paramsToJSON(params: Params): string {
  return JSON.stringify(params, null, 2);
}

export function exportJSON(params: Params): string {
  const name = `${fileBase(params)}.json`;
  downloadBlob(new Blob([paramsToJSON(params)], { type: 'application/json' }), name);
  return name;
}

/** Parse + validate preset JSON text. Throws an Error with a friendly message. */
export function parseParamsJSON(text: string, source = 'JSON'): Params {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`${source} is not valid JSON (${(e as Error).message})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${source} does not contain a pattern preset object`);
  }
  const o = parsed as Record<string, unknown>;
  const known = ['field', 'layout', 'marks', 'map', 'colour', 'canvas'].filter((k) => k in o);
  if (known.length === 0) {
    throw new Error(`${source} does not look like a OneSyntax pattern preset`);
  }
  return withDefaults(parsed);
}

export async function importJSON(file: File): Promise<Params> {
  const text = await file.text();
  return parseParamsJSON(text, `"${file.name}"`);
}

export async function copyJSON(params: Params): Promise<void> {
  await navigator.clipboard.writeText(paramsToJSON(params));
}

// ─────────────────────────────────────────────────────────── localStorage presets

const STORE_KEY = 'osp.presets.v1';

function readStore(): Record<string, Params> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Params>): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function savePreset(name: string, params: Params): boolean {
  const key = name.trim();
  if (!key) return false;
  const store = readStore();
  store[key] = clone(params);
  return writeStore(store);
}

export function listSaved(): string[] {
  return Object.keys(readStore()).sort((a, b) => a.localeCompare(b));
}

export function loadSaved(name: string): Params | null {
  const p = readStore()[name];
  return p ? withDefaults(p) : null;
}

export function deleteSaved(name: string): boolean {
  const store = readStore();
  if (!(name in store)) return false;
  delete store[name];
  return writeStore(store);
}

// ─────────────────────────────────────────────────────────── WebM

const WEBM_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const FPS = 60;

/**
 * Record `seconds` of the animation from the current time into a WebM file.
 * Frames are rendered deterministically (time += 1/60 * speed per frame) and paced in real time
 * so MediaRecorder timestamps are correct. `onProgress` gets 0..1.
 */
export async function exportWebM(
  params: Params,
  seconds = params.motion.loopSeconds,
  onProgress: (fraction: number) => void = () => {},
): Promise<string> {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not supported in this browser');
  const mimeType = WEBM_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error('WebM recording is not supported in this browser');

  // Snapshot so UI edits during recording do not change the clip.
  const p = clone(params);
  const W = p.canvas.width, H = p.canvas.height;
  const pr = Math.min(1, 1920 / Math.max(W, H));

  const canvas = document.createElement('canvas');
  const renderer = new Renderer(canvas, { preserveDrawingBuffer: true });
  renderer.resize(W, H, pr);
  // Some encoders dislike odd frame sizes: the renderer sizes the backing store, we only check it exists.
  if (!canvas.width || !canvas.height) throw new Error('Could not size the recording canvas');

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12e6 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  const frames = Math.max(1, Math.round(seconds * FPS));
  const t0 = p.motion.time;
  const dt = (1 / FPS) * p.motion.speed;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

  try {
    // Draw frame 0 before starting so the first captured frame is valid.
    renderer.render(buildGeometry(p, t0));
    recorder.start(250);
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      if (i > 0) renderer.render(buildGeometry(p, t0 + i * dt));
      track.requestFrame?.();
      onProgress((i + 1) / frames);
      await wait(start + ((i + 1) * 1000) / FPS - performance.now());
    }
    recorder.stop();
    await stopped;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    renderer.dispose();
  }

  const blob = new Blob(chunks, { type: 'video/webm' });
  if (blob.size === 0) throw new Error('Recording produced no data');
  const name = `${fileBase(p)}.webm`;
  downloadBlob(blob, name);
  return name;
}
