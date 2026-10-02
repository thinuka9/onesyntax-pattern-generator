import type { Params } from './types';

/**
 * The neutral baseline every preset is merged onto. A preset only needs to list what differs;
 * `withDefaults` fills the rest so old/partial JSON files still load.
 */
export function defaultParams(): Params {
  return {
    version: 1,
    name: 'Untitled',
    seed: 1234,
    field: {
      waveA: { on: true, weight: 1, freq: 2, dir: 0, phase: 0, speed: 0.1 },
      waveB: { on: false, weight: 0.5, freq: 3, dir: 90, phase: 0, speed: -0.07 },
      radial: { on: false, weight: 0.5, cx: 0.5, cy: 0.5, freq: 3, speed: 0.1 },
      noise: { on: false, weight: 0.5, scale: 2, octaves: 3, drift: 0.05 },
      data: { on: false, weight: 1, seed: 7, smoothing: 0.3, trend: 0, volatility: 0.5, axis: 'x', values: '', speed: 0 },
      gradient: { on: false, weight: 0.5, angle: 0 },
      shaping: { warpAmount: 0, warpScale: 2, mirror: 'none', contrast: 1, bias: 1, quantise: 0, invert: false },
      attractor: { on: false, x: 0.5, y: 0.5, radius: 0.3, strength: 0, bend: 0 },
    },
    layout: {
      mode: 'grid', cols: 24, rows: 24, margin: 0.08, gutterX: 0.2, gutterY: 0.2,
      jitter: 0, rotation: 0, stagger: 0.5, anchor: 'center',
      strandAxis: 'vertical', strandSamples: 160, strandAmount: 0.6,
    },
    marks: {
      shape: 'rect', radius: 0, skew: 0,
      meter: {
        trackThickness: 0.08, trackOpacity: 0.35, fillThickness: 0.45, capSize: 0.5,
        capOffset: 0.08, capFollowsWave: false, capWaveFreq: 1.5, capWaveSpeed: 0.2,
      },
    },
    map: {
      thickness: { source: 'const', min: 0.5, max: 0.5 },
      length: { source: 'field', min: 0.2, max: 1 },
      angle: { source: 'const', min: 0, max: 0 },
      opacity: { source: 'const', min: 1, max: 1 },
      colour: { source: 'field', min: 0, max: 1 },
      offsetX: { source: 'const', min: 0, max: 0 },
      offsetY: { source: 'const', min: 0, max: 0 },
      skew: { source: 'const', min: 0, max: 0 },
      threshold: 0,
      angleMode: 'fixed',
      fixedAngle: 0,
    },
    colour: {
      palette: 'Signal', background: '#FAFBFD', stops: ['#151515', '#151515'],
      source: 'field', continuous: false, gradAngle: 0, gradRepeat: 1,
      accent: '#F76E43', accentEvery: 0, accentTarget: 'column',
    },
    motion: { playing: true, speed: 1, time: 0, loopSeconds: 5 },
    canvas: { format: '1:1', width: 1080, height: 1080 },
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export type PartialParams = DeepPartial<Params>;

/** Deep-merge `partial` onto defaults (arrays are replaced, not merged). Unknown keys are dropped. */
export function withDefaults(partial: PartialParams | unknown): Params {
  const merge = (base: any, over: any): any => {
    if (over === undefined || over === null) return base;
    if (Array.isArray(base)) return Array.isArray(over) ? over.slice() : base;
    if (typeof base === 'object') {
      const out: any = {};
      for (const k of Object.keys(base)) out[k] = merge(base[k], typeof over === 'object' ? over[k] : undefined);
      return out;
    }
    return typeof over === typeof base ? over : base;
  };
  return merge(defaultParams(), partial);
}
