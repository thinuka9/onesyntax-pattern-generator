/**
 * Tweakpane control panel. Binds directly to the single mutable `params` object owned by main.ts.
 * Whole-object replacements (preset, randomise, import, palette, format) are copied INTO the existing
 * object with `deepAssign`, so every binding keeps pointing at live data.
 */
import { Pane } from 'tweakpane';
import type { BladeApi, FolderApi, ListBladeApi } from 'tweakpane';
import type { Mapping, Params } from './types';
import {
  FORMATS, PALETTES, PRESET_NAMES, applyFormat, applyPalette, getPreset, nudge, randomiseAll,
} from './presets';
import {
  copyJSON, deleteSaved, exportJSON, exportPNG, exportSVG, exportWebM, importJSON, listSaved, loadSaved, savePreset,
} from './export';
import { hexToRgb, rgbToHex, sampleStops } from './util';

export type Tone = 'info' | 'error' | 'busy';

export interface UIHooks {
  /** Something changed: re-render. `resize` = canvas size may have changed. */
  changed(opts?: { resize?: boolean }): void;
  /** Show a message in the status line. tone 'busy' stays until replaced; null clears. */
  message(text: string | null, tone?: Tone): void;
}

export interface UIState {
  preset: string;
  palette: string;
  saveName: string;
  saved: string;
  stopCount: number;
  stopA: string;
  stopB: string;
  stopC: string;
  scrub: number;
  format: string;
  pngScale: number;
}

export interface UI {
  pane: Pane;
  state: UIState;
  /** Re-sync every control (and visibility) from params. */
  refresh(): void;
  /** Cheap refresh of the play toggle + time scrub only. */
  refreshTime(): void;
  /** Replace params contents in place (keeps bindings valid) and refresh. */
  load(next: Params): void;
  togglePlay(): void;
  randomise(): void;
  savePNG(): Promise<void>;
  readonly recording: boolean;
}

// ─────────────────────────────────────────────────────────── helpers

type Obj = Record<string, any>;

/** Copy `src` into `dst` recursively, preserving object/array identity in `dst`. */
export function deepAssign(dst: Obj, src: Obj): void {
  for (const k of Object.keys(src)) {
    const s = src[k];
    const d = dst[k];
    if (Array.isArray(s)) {
      if (Array.isArray(d)) {
        d.length = 0;
        for (const x of s) d.push(x);
      } else dst[k] = s.slice();
    } else if (s && typeof s === 'object') {
      if (d && typeof d === 'object' && !Array.isArray(d)) deepAssign(d, s);
      else dst[k] = JSON.parse(JSON.stringify(s));
    } else {
      dst[k] = s;
    }
  }
}

/** Seed for "new seed" / randomise. Only picks a seed — the pattern itself stays fully seeded. */
export function newSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % 1000000;
}

const fmt = (digits: number) => (v: number) => v.toFixed(digits);
const opts = (values: readonly string[]) => values.map((v) => ({ text: v, value: v }));

function slider<O extends Obj>(f: FolderApi, obj: O, key: keyof O & string, label: string, min: number, max: number, digits = 2) {
  return f.addBinding(obj, key, { label, min, max, format: fmt(digits) });
}
function intSlider<O extends Obj>(f: FolderApi, obj: O, key: keyof O & string, label: string, min: number, max: number) {
  return f.addBinding(obj, key, { label, min, max, step: 1, format: fmt(0) });
}
function list<O extends Obj>(f: FolderApi, obj: O, key: keyof O & string, label: string, values: { text: string; value: string }[]) {
  return f.addBinding(obj, key, { label, options: values });
}

const SOURCES = [
  { text: 'Field', value: 'field' }, { text: 'X position', value: 'x' }, { text: 'Y position', value: 'y' },
  { text: 'Radial', value: 'radial' }, { text: 'Constant', value: 'const' },
];
const MAPPINGS: { key: keyof Params['map']; title: string; min: number; max: number; digits: number; open: boolean }[] = [
  { key: 'thickness', title: 'Thickness', min: 0, max: 1.5, digits: 2, open: true },
  { key: 'length', title: 'Length', min: 0, max: 3, digits: 2, open: true },
  { key: 'angle', title: 'Angle', min: -180, max: 180, digits: 0, open: false },
  { key: 'opacity', title: 'Opacity', min: 0, max: 1, digits: 2, open: false },
  { key: 'colour', title: 'Colour position', min: 0, max: 1, digits: 2, open: false },
  { key: 'offsetX', title: 'Offset X', min: -1, max: 1, digits: 2, open: false },
  { key: 'offsetY', title: 'Offset Y', min: -1, max: 1, digits: 2, open: false },
  { key: 'skew', title: 'Skew', min: -75, max: 75, digits: 0, open: false },
];

// ─────────────────────────────────────────────────────────── build

export function buildUI(container: HTMLElement, params: Params, hooks: UIHooks): UI {
  const pane = new Pane({ container });
  let syncing = false;
  let recording = false;

  const firstPreset = PRESET_NAMES.includes(params.name) ? params.name : PRESET_NAMES[0] ?? '';
  const state: UIState = {
    preset: firstPreset,
    palette: '',
    saveName: params.name,
    saved: '',
    stopCount: 2,
    stopA: '#151515',
    stopB: '#151515',
    stopC: '#151515',
    scrub: 0,
    format: 'custom',
    pngScale: 2,
  };
  let currentPreset = firstPreset;

  const paletteOptions = () => [{ text: 'Custom', value: '' }, ...opts(Object.keys(PALETTES))];
  const formatOptions = () => [
    ...Object.keys(FORMATS).map((k) => ({ text: FORMATS[k].label || k, value: k })),
    { text: 'Custom', value: 'custom' },
  ];
  const savedOptions = () => {
    const names = listSaved();
    return names.length ? opts(names) : [{ text: '(none saved)', value: '' }];
  };

  // Proxies ← params
  function syncStateFromParams() {
    const c = params.colour;
    state.palette = c.palette in PALETTES ? c.palette : '';
    const s = c.stops.length ? c.stops : ['#151515'];
    state.stopCount = s.length >= 3 ? 3 : 2;
    state.stopA = s[0];
    state.stopC = s[s.length - 1];
    state.stopB = s.length >= 3 ? s[1] : rgbToHex(sampleStops([hexToRgb(s[0]), hexToRgb(s[s.length - 1])], 0.5));
    state.scrub = Math.min(60, Math.max(0, params.motion.time));
    state.format = params.canvas.format in FORMATS ? params.canvas.format : 'custom';
    if (PRESET_NAMES.includes(params.name)) state.preset = params.name;
  }
  function writeStops() {
    params.colour.stops.length = 0;
    if (state.stopCount === 3) params.colour.stops.push(state.stopA, state.stopB, state.stopC);
    else params.colour.stops.push(state.stopA, state.stopC);
  }

  const changed = (resize = false) => {
    if (!syncing) hooks.changed({ resize });
  };
  const report = (e: unknown) => {
    console.error(e);
    hooks.message((e as Error)?.message ?? String(e), 'error');
  };

  // ── Preset
  const fPreset = pane.addFolder({ title: 'Preset', expanded: true });
  fPreset.addBinding(state, 'preset', { label: 'Preset', options: opts(PRESET_NAMES) }).on('change', (ev) => {
    if (syncing) return;
    currentPreset = ev.value;
    loadPreserving(getPreset(ev.value), { keepPlaying: true });
    state.saveName = params.name;
    refresh();
  });
  const paletteHandler = (ev: { value: string }) => {
    if (syncing || !ev.value) return;
    load(applyPalette(params, ev.value));
  };
  fPreset.addBinding(state, 'palette', { label: 'Palette', options: paletteOptions() }).on('change', paletteHandler);
  fPreset.addBinding(params, 'seed', { label: 'Seed', step: 1, min: 0, format: fmt(0) }).on('change', () => changed());
  fPreset.addButton({ title: 'New seed' }).on('click', () => {
    params.seed = newSeed();
    refresh();
    changed();
  });
  fPreset.addBlade({ view: 'separator' });
  const bRand = fPreset.addButton({ title: 'Randomise all  (R)' });
  bRand.on('click', () => randomise());
  bRand.element.classList.add('osp-primary');
  fPreset.addButton({ title: 'Randomise within preset' }).on('click', () => {
    loadPreserving(nudge(params, newSeed(), 0.15), { keepPlaying: true, keepCanvas: true });
  });
  fPreset.addButton({ title: 'Reset to preset' }).on('click', () => {
    loadPreserving(getPreset(currentPreset), { keepPlaying: true });
  });
  const fSaved = fPreset.addFolder({ title: 'Saved in this browser', expanded: false });
  fSaved.addBinding(state, 'saveName', { label: 'Save as', view: 'text' });
  fSaved.addButton({ title: 'Save to browser' }).on('click', () => {
    const name = state.saveName.trim();
    if (!name) return hooks.message('Enter a name to save the preset', 'error');
    if (savePreset(name, params)) {
      refreshSaved(name);
      hooks.message(`Saved “${name}” in this browser`);
    } else hooks.message('Could not save (browser storage unavailable or full)', 'error');
  });
  const savedList = fSaved.addBlade({
    view: 'list', label: 'Saved', options: savedOptions(), value: '',
  }) as ListBladeApi<string>;
  savedList.on('change', (ev) => { state.saved = ev.value; });
  fSaved.addButton({ title: 'Load saved' }).on('click', () => {
    const name = savedList.value;
    const p = name ? loadSaved(name) : null;
    if (!p) return hooks.message('Nothing saved under that name', 'error');
    load(p);
    state.saveName = name;
    refresh();
    hooks.message(`Loaded “${name}”`);
  });
  fSaved.addButton({ title: 'Delete saved' }).on('click', () => {
    const name = savedList.value;
    if (!name) return;
    deleteSaved(name);
    refreshSaved('');
    hooks.message(`Deleted “${name}”`);
  });
  function refreshSaved(select: string) {
    savedList.options = savedOptions().map((o) => ({ text: o.text, value: o.value }));
    const names = listSaved();
    savedList.value = names.includes(select) ? select : names[0] ?? '';
  }

  // ── Field
  const fField = pane.addFolder({ title: 'Field', expanded: false });
  const toggles: { on: { on: boolean }; blades: BladeApi[] }[] = [];
  const component = (title: string, obj: { on: boolean }, expanded: boolean, build: (f: FolderApi) => BladeApi[]) => {
    const f = fField.addFolder({ title, expanded });
    f.addBinding(obj, 'on', { label: 'On' });
    toggles.push({ on: obj, blades: build(f) });
  };
  const wave = (title: string, w: Params['field']['waveA'], expanded: boolean) =>
    component(title, w, expanded, (f) => [
      slider(f, w, 'weight', 'Weight', 0, 1),
      slider(f, w, 'freq', 'Frequency', 0, 20),
      slider(f, w, 'dir', 'Direction', 0, 360, 0),
      slider(f, w, 'phase', 'Phase', 0, 1),
      slider(f, w, 'speed', 'Speed', -2, 2),
    ]);
  const F = params.field;
  wave('Wave A', F.waveA, true);
  wave('Wave B', F.waveB, false);
  component('Radial', F.radial, false, (f) => [
    slider(f, F.radial, 'weight', 'Weight', 0, 1),
    slider(f, F.radial, 'cx', 'Centre X', 0, 1),
    slider(f, F.radial, 'cy', 'Centre Y', 0, 1),
    slider(f, F.radial, 'freq', 'Rings', 0, 20),
    slider(f, F.radial, 'speed', 'Speed', -2, 2),
  ]);
  component('Noise', F.noise, false, (f) => [
    slider(f, F.noise, 'weight', 'Weight', 0, 1),
    slider(f, F.noise, 'scale', 'Scale', 0.2, 12),
    intSlider(f, F.noise, 'octaves', 'Octaves', 1, 6),
    slider(f, F.noise, 'drift', 'Drift', 0, 2),
  ]);
  component('Data', F.data, false, (f) => [
    slider(f, F.data, 'weight', 'Weight', 0, 1),
    f.addBinding(F.data, 'values', { label: 'Values', view: 'text' }),
    list(f, F.data, 'axis', 'Axis', [{ text: 'Per column (x)', value: 'x' }, { text: 'Per row (y)', value: 'y' }]),
    f.addBinding(F.data, 'seed', { label: 'Data seed', step: 1, min: 0, format: fmt(0) }),
    slider(f, F.data, 'smoothing', 'Smoothing', 0, 1),
    slider(f, F.data, 'trend', 'Trend', -1, 1),
    slider(f, F.data, 'volatility', 'Volatility', 0, 1),
    slider(f, F.data, 'speed', 'Scroll speed', 0, 2),
  ]);
  component('Gradient', F.gradient, false, (f) => [
    slider(f, F.gradient, 'weight', 'Weight', 0, 1),
    slider(f, F.gradient, 'angle', 'Angle', 0, 360, 0),
  ]);
  component('Attractor', F.attractor, false, (f) => [
    f.addBinding(F, 'attractor', {
      label: 'Centre', x: { min: 0, max: 1, format: fmt(2) }, y: { min: 0, max: 1, format: fmt(2) },
    }),
    slider(f, F.attractor, 'radius', 'Radius', 0, 1),
    slider(f, F.attractor, 'strength', 'Strength', -1, 1),
    slider(f, F.attractor, 'bend', 'Bend', 0, 1),
  ]);

  // ── Shaping
  const S = F.shaping;
  const fShape = pane.addFolder({ title: 'Shaping', expanded: false });
  slider(fShape, S, 'warpAmount', 'Warp amount', 0, 0.5, 3);
  slider(fShape, S, 'warpScale', 'Warp scale', 0.2, 12);
  list(fShape, S, 'mirror', 'Mirror', [
    { text: 'None', value: 'none' }, { text: 'X', value: 'x' }, { text: 'Y', value: 'y' }, { text: 'X + Y', value: 'xy' },
  ]);
  slider(fShape, S, 'contrast', 'Contrast', 0, 4);
  slider(fShape, S, 'bias', 'Bias (gamma)', 0.1, 5);
  intSlider(fShape, S, 'quantise', 'Quantise', 0, 32);
  fShape.addBinding(S, 'invert', { label: 'Invert' });

  // ── Layout
  const L = params.layout;
  const fLayout = pane.addFolder({ title: 'Layout', expanded: true });
  list(fLayout, L, 'mode', 'Mode', opts(['grid', 'brick', 'columns', 'rows', 'strands']));
  intSlider(fLayout, L, 'cols', 'Columns', 1, 400);
  intSlider(fLayout, L, 'rows', 'Rows', 1, 400);
  slider(fLayout, L, 'margin', 'Margin', 0, 0.45);
  slider(fLayout, L, 'gutterX', 'Gutter X', 0, 0.95);
  slider(fLayout, L, 'gutterY', 'Gutter Y', 0, 0.95);
  slider(fLayout, L, 'jitter', 'Jitter', 0, 1);
  slider(fLayout, L, 'rotation', 'Rotation', -180, 180, 0);
  const bStagger = slider(fLayout, L, 'stagger', 'Brick stagger', 0, 1);
  list(fLayout, L, 'anchor', 'Anchor', opts(['start', 'center', 'end']));
  const bStrand = [
    list(fLayout, L, 'strandAxis', 'Strand axis', opts(['vertical', 'horizontal'])),
    intSlider(fLayout, L, 'strandSamples', 'Strand samples', 8, 400),
    slider(fLayout, L, 'strandAmount', 'Strand amount', 0, 2),
  ];

  // ── Marks
  const M = params.marks;
  const fMarks = pane.addFolder({ title: 'Marks', expanded: false });
  list(fMarks, M, 'shape', 'Shape', opts(['rect', 'pill', 'parallelogram', 'line', 'dot', 'meter']));
  slider(fMarks, M, 'radius', 'Corner radius', 0, 1);
  slider(fMarks, M, 'skew', 'Skew', -75, 75, 0);
  const fMeter = fMarks.addFolder({ title: 'Meter', expanded: true });
  const MT = M.meter;
  slider(fMeter, MT, 'trackThickness', 'Track width', 0, 1);
  slider(fMeter, MT, 'trackOpacity', 'Track opacity', 0, 1);
  slider(fMeter, MT, 'fillThickness', 'Fill width', 0, 1);
  slider(fMeter, MT, 'capSize', 'Cap size', 0, 1);
  slider(fMeter, MT, 'capOffset', 'Cap offset', 0, 1);
  fMeter.addBinding(MT, 'capFollowsWave', { label: 'Cap follows wave' });
  const bCapWave = [
    slider(fMeter, MT, 'capWaveFreq', 'Cap wave freq', 0, 10),
    slider(fMeter, MT, 'capWaveSpeed', 'Cap wave speed', -2, 2),
  ];

  // ── Mappings
  const MP = params.map;
  const fMap = pane.addFolder({ title: 'Mappings', expanded: false });
  slider(fMap, MP, 'threshold', 'Threshold', 0, 1);
  list(fMap, MP, 'angleMode', 'Angle mode', [
    { text: 'Fixed', value: 'fixed' }, { text: 'From value', value: 'value' },
    { text: 'Flow (contours)', value: 'flow' }, { text: 'Swirl', value: 'swirl' },
  ]);
  const bFixedAngle = slider(fMap, MP, 'fixedAngle', 'Base angle', -180, 180, 0);
  const mapFolders: Partial<Record<string, FolderApi>> = {};
  for (const m of MAPPINGS) {
    const obj = MP[m.key] as Mapping;
    const f = fMap.addFolder({ title: m.title, expanded: m.open });
    list(f, obj, 'source', 'Source', SOURCES);
    slider(f, obj, 'min', 'Min', m.min, m.max, m.digits);
    slider(f, obj, 'max', 'Max', m.min, m.max, m.digits);
    mapFolders[m.key] = f;
  }

  // ── Colour
  const C = params.colour;
  const fColour = pane.addFolder({ title: 'Colour', expanded: true });
  fColour.addBinding(state, 'palette', { label: 'Palette', options: paletteOptions() }).on('change', paletteHandler);
  fColour.addBinding(C, 'background', { label: 'Background', view: 'color' });
  fColour.addBinding(state, 'stopCount', { label: 'Stops', options: [{ text: '2', value: 2 }, { text: '3', value: 3 }] })
    .on('change', () => { if (!syncing) writeStops(); });
  fColour.addBinding(state, 'stopA', { label: 'Stop 1', view: 'color' }).on('change', () => { if (!syncing) writeStops(); });
  const bStopB = fColour.addBinding(state, 'stopB', { label: 'Stop 2', view: 'color' });
  bStopB.on('change', () => { if (!syncing) writeStops(); });
  const bStopC = fColour.addBinding(state, 'stopC', { label: 'Stop 3', view: 'color' });
  bStopC.on('change', () => { if (!syncing) writeStops(); });
  list(fColour, C, 'source', 'Colour by', [
    { text: 'Field', value: 'field' }, { text: 'X position', value: 'x' }, { text: 'Y position', value: 'y' },
    { text: 'Radial', value: 'radial' }, { text: 'Random', value: 'random' },
  ]);
  fColour.addBinding(C, 'continuous', { label: 'Screen gradient' });
  const bGrad = [
    slider(fColour, C, 'gradAngle', 'Gradient angle', -180, 180, 0),
    slider(fColour, C, 'gradRepeat', 'Gradient repeat', 1, 12, 1),
  ];
  fColour.addBinding(C, 'accent', { label: 'Accent', view: 'color' });
  intSlider(fColour, C, 'accentEvery', 'Accent every', 0, 32);
  const bAccentTarget = list(fColour, C, 'accentTarget', 'Accent target', [
    { text: 'Mark', value: 'mark' }, { text: 'Column', value: 'column' }, { text: 'Row', value: 'row' },
  ]);

  // ── Motion
  const MO = params.motion;
  const fMotion = pane.addFolder({ title: 'Motion', expanded: true });
  const bPlaying = fMotion.addBinding(MO, 'playing', { label: 'Playing  (space)' });
  slider(fMotion, MO, 'speed', 'Speed', 0, 4);
  const bScrub = fMotion.addBinding(state, 'scrub', { label: 'Time (s)', min: 0, max: 60, format: fmt(2) });
  bScrub.on('change', (ev) => { if (!syncing) MO.time = ev.value; });
  slider(fMotion, MO, 'loopSeconds', 'Loop length (s)', 1, 30, 1);

  // ── Export
  const fExport = pane.addFolder({ title: 'Export', expanded: true });
  fExport.addBinding(state, 'format', { label: 'Format', options: formatOptions() }).on('change', (ev) => {
    if (syncing) return;
    if (ev.value === 'custom') { params.canvas.format = 'custom'; return; }
    load(applyFormat(params, ev.value));
  });
  const sizeChanged = () => {
    if (syncing) return;
    const cv = params.canvas;
    cv.width = Math.round(Math.min(8192, Math.max(16, cv.width)));
    cv.height = Math.round(Math.min(8192, Math.max(16, cv.height)));
    cv.format = 'custom';
    syncing = true;
    state.format = 'custom';
    pane.refresh();
    syncing = false;
    changed(true);
  };
  fExport.addBinding(params.canvas, 'width', { label: 'Width', min: 16, step: 1, format: fmt(0) }).on('change', sizeChanged);
  fExport.addBinding(params.canvas, 'height', { label: 'Height', min: 16, step: 1, format: fmt(0) }).on('change', sizeChanged);
  fExport.addBinding(state, 'pngScale', {
    label: 'PNG scale', options: [{ text: '1×', value: 1 }, { text: '2×', value: 2 }, { text: '4×', value: 4 }],
  });
  const bPng = fExport.addButton({ title: 'Save PNG  (S)' });
  bPng.on('click', () => void savePNG());
  bPng.element.classList.add('osp-primary');
  fExport.addButton({ title: 'Save SVG' }).on('click', () => {
    try {
      hooks.message(`Saved ${exportSVG(params)}`);
    } catch (e) { report(e); }
  });
  fExport.addButton({ title: 'Export JSON' }).on('click', () => {
    try { hooks.message(`Saved ${exportJSON(params)}`); } catch (e) { report(e); }
  });
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const p = await importJSON(file);
      load(p);
      state.saveName = p.name;
      refresh();
      hooks.message(`Imported ${file.name}`);
    } catch (e) { report(e); }
  });
  fExport.addButton({ title: 'Import JSON' }).on('click', () => fileInput.click());
  fExport.addButton({ title: 'Copy JSON' }).on('click', async () => {
    try {
      await copyJSON(params);
      hooks.message('Preset JSON copied to clipboard');
    } catch (e) { report(e); }
  });
  fExport.addButton({ title: 'Record WebM' }).on('click', async () => {
    if (recording) return;
    recording = true;
    try {
      const secs = params.motion.loopSeconds;
      hooks.message(`Recording WebM 0% · ${secs.toFixed(1)} s`, 'busy');
      const name = await exportWebM(params, secs, (f) =>
        hooks.message(`Recording WebM ${Math.round(f * 100)}% · ${secs.toFixed(1)} s`, 'busy'));
      hooks.message(`Saved ${name}`);
    } catch (e) { report(e); }
    finally { recording = false; }
  });

  // ── global change → re-render + visibility
  pane.on('change', () => {
    if (syncing) return;
    updateVisibility();
    changed();
  });

  // ─────────────────────────────────────────────────────────── behaviour

  function updateVisibility() {
    bStagger.hidden = L.mode !== 'brick';
    for (const b of bStrand) b.hidden = L.mode !== 'strands';
    fMeter.hidden = M.shape !== 'meter';
    for (const b of bCapWave) b.hidden = !MT.capFollowsWave;
    bFixedAngle.hidden = MP.angleMode === 'value';
    if (mapFolders.angle) mapFolders.angle.hidden = MP.angleMode !== 'value';
    bStopB.hidden = state.stopCount !== 3;
    bStopC.label = state.stopCount === 3 ? 'Stop 3' : 'Stop 2';
    for (const b of bGrad) b.hidden = !C.continuous;
    bAccentTarget.hidden = C.accentEvery === 0;
    for (const t of toggles) for (const b of t.blades) b.disabled = !t.on.on;
  }

  function refresh() {
    syncing = true;
    try {
      syncStateFromParams();
      pane.refresh();
    } finally {
      syncing = false;
    }
    updateVisibility();
  }

  function refreshTime() {
    syncing = true;
    try {
      state.scrub = Math.min(60, Math.max(0, MO.time));
      bScrub.refresh();
      bPlaying.refresh();
    } finally {
      syncing = false;
    }
  }

  function load(next: Params) {
    deepAssign(params, next);
    refresh();
    hooks.changed({ resize: true });
  }

  function loadPreserving(next: Params, o: { keepPlaying?: boolean; keepCanvas?: boolean }) {
    const playing = params.motion.playing;
    const canvas = { ...params.canvas };
    const n: Params = JSON.parse(JSON.stringify(next));
    if (o.keepPlaying) n.motion.playing = playing;
    if (o.keepCanvas) n.canvas = canvas;
    load(n);
  }

  function togglePlay() {
    MO.playing = !MO.playing;
    refreshTime();
    hooks.changed();
  }

  function randomise() {
    try {
      loadPreserving(randomiseAll(params, newSeed()), { keepPlaying: true, keepCanvas: true });
      hooks.message(`Randomised · seed ${params.seed}`);
    } catch (e) { report(e); }
  }

  async function savePNG() {
    try {
      hooks.message(`Rendering PNG ${state.pngScale}×…`, 'busy');
      const name = await exportPNG(params, state.pngScale);
      hooks.message(`Saved ${name}`);
    } catch (e) { report(e); }
  }

  refresh();
  refreshSaved('');

  return {
    pane, state, refresh, refreshTime, load, togglePlay, randomise, savePNG,
    get recording() { return recording; },
  };
}
