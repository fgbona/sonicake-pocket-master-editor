/**
 * The maths behind a block's "screen": each function maps a block's parameters to points in a unit
 * box (x right, y up, both 0..1) that the component turns into SVG. Values are only ever
 * normalised against the range the catalog gives; no units are invented.
 */

interface VizParam {
  readonly name: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
}
export interface VizBlock {
  readonly params: readonly VizParam[];
  readonly model?: { readonly name: string; readonly type: string } | null;
}
export type Point = readonly [number, number];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const find = (b: VizBlock, label: RegExp) => b.params.find((p) => label.test(p.name));

/** A parameter's value as 0..1 of its own range; `fallback` when the model lacks it or the value is unread. */
export function norm(b: VizBlock, label: RegExp, fallback: number): number {
  const p = find(b, label);
  if (!p || p.max === p.min || !Number.isFinite(p.value)) return fallback;
  return clamp01((p.value - p.min) / (p.max - p.min));
}

/** True when the block has a Sync-style switch that is on. */
export function isSynced(b: VizBlock): boolean {
  return b.params.some((p) => /^(time |a )?sync$/i.test(p.name) && p.value > p.min);
}

export const isGate = (b: VizBlock) => /gate/i.test(`${b.model?.name ?? ''} ${b.model?.type ?? ''}`);

/** Compressor transfer curve: unity below the knee, 1/ratio slope above it. */
export function compressorCurve(b: VizBlock): { knee: Point; points: readonly Point[] } {
  const xt = 0.15 + 0.7 * norm(b, /threshold|sustain/i, 0.5);
  const slope = 1 / (1 + 7 * norm(b, /ratio/i, 0.3));
  const end = xt + (1 - xt) * slope;
  return {
    knee: [xt, xt],
    points: [
      [0, 0],
      [xt, xt],
      [1, end],
    ],
  };
}

/** Gate: where the threshold sits on the level scale; everything below it is muted. */
export const gateThreshold = (b: VizBlock) => 0.1 + 0.8 * norm(b, /threshold/i, 0.5);

/** Delay taps: a dry spike at 0, then echoes spaced by Time, each scaled down by Feedback. */
export function delayTaps(b: VizBlock): { taps: readonly Point[]; mix: number; synced: boolean } {
  const step = 0.07 + 0.3 * norm(b, /^(time|time a)$/i, 0.4);
  const fb = find(b, /^feedback/i);
  // Feedback may run negative (inverted repeats): its size sets the decay either way.
  const feedback = fb && Number.isFinite(fb.value) ? clamp01(Math.abs(fb.value) / Math.max(Math.abs(fb.min), Math.abs(fb.max), 1)) : 0.5;
  const taps: Point[] = [];
  for (let n = 1; n <= 12; n++) {
    const x = 0.04 + n * step;
    const h = 0.85 * feedback ** (n - 1);
    if (x > 1 || h < 0.06) break;
    taps.push([x, h]);
  }
  return { taps, mix: norm(b, /mix/i, 0.5), synced: isSynced(b) };
}

/** Reverb: silence for Pre Delay, a rise to the Mix level, then an exponential decay whose length follows Decay. */
export function reverbEnvelope(b: VizBlock): { points: readonly Point[]; start: number; end: number } {
  const start = 0.04 + 0.25 * norm(b, /pre ?delay/i, 0);
  const level = 0.35 + 0.6 * norm(b, /mix/i, 0.5);
  const end = start + (0.12 + 0.85 * norm(b, /decay/i, 0.5)) * (1 - start);
  const steps = 32;
  const tail = Array.from({ length: steps + 1 }, (_, i): Point => [start + ((end - start) * i) / steps, level * Math.exp((-4.6 * i) / steps)]);
  return { points: [[0, 0], [start, 0], ...tail], start, end };
}

/** EQ: the band parameters as gaussian bumps over an even spread; 0.5 is flat. */
export function eqCurve(b: VizBlock): readonly Point[] {
  const bands = b.params.filter((p) => /\d\s*k?hz/i.test(p.name));
  const gains = (bands.length > 0 ? bands : b.params.filter((p) => !/volume|level/i.test(p.name))).map((p) => norm({ params: [p] }, /./, 0.5));
  const n = gains.length;
  const centre = (i: number) => (n === 1 ? 0.5 : 0.1 + (0.8 * i) / (n - 1));
  const sigma = n > 1 ? 0.45 / n : 0.2;
  return Array.from({ length: 49 }, (_, s): Point => {
    const x = s / 48;
    const lift = gains.reduce((sum, g, i) => sum + (g - 0.5) * Math.exp(-(((x - centre(i)) / sigma) ** 2) / 2), 0);
    return [x, clamp01(0.5 + lift)];
  });
}

/** Heel-to-toe bar: the min..max range as fractions 0..1 of the pedal's 0..100 travel. */
export const sweepRange = (min: number, max: number): readonly [number, number] => [clamp01(Math.min(min, max) / 100), clamp01(Math.max(min, max) / 100)];

/** Unit points as an SVG polyline path inside a w×h box with `pad` around it (y flipped). */
export function unitPath(points: readonly Point[], w: number, h: number, pad = 8): string {
  const f = (n: number) => String(Math.round(n * 10) / 10);
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(pad + x * (w - 2 * pad))} ${f(h - pad - y * (h - 2 * pad))}`).join(' ');
}
