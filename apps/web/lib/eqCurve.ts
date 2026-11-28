/** The Matribox global EQ's frequency response, from the RBJ Audio EQ Cookbook biquads. */

export const EQ_FS = 48000;
export const EQ_MIN_HZ = 20;
export const EQ_MAX_HZ = 20000;

// Every filter takes the Q the unit stores (docs/matribox.md "Global EQ"); one with no usable Q is left out.

export interface EqFilter {
  readonly frequency: number;
  readonly q: number;
}
export interface EqBandSpec extends EqFilter {
  readonly gain: number;
  /** A band that is off adds nothing. */
  readonly on?: boolean;
}
export interface EqSpec {
  readonly bands: readonly EqBandSpec[];
  /** Leave out (null) a cut that is off. */
  readonly lowCut?: EqFilter | null;
  readonly highCut?: EqFilter | null;
}

type Biquad = readonly [b0: number, b1: number, b2: number, a0: number, a1: number, a2: number];

const usable = (q: number) => Number.isFinite(q) && q > 0;

function peaking(f: number, q: number, gainDb: number): Biquad {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * f) / EQ_FS;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return [1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c, 1 - alpha / A];
}

function highPass(f: number, q: number): Biquad {
  const w = (2 * Math.PI * f) / EQ_FS;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha];
}

function lowPass(f: number, q: number): Biquad {
  const w = (2 * Math.PI * f) / EQ_FS;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha];
}

/** |H(e^jw)|^2 of one biquad at frequency f. */
function power([b0, b1, b2, a0, a1, a2]: Biquad, f: number): number {
  const w = (2 * Math.PI * f) / EQ_FS;
  const mag = (x0: number, x1: number, x2: number) => {
    const re = x0 + x1 * Math.cos(w) + x2 * Math.cos(2 * w);
    const im = -(x1 * Math.sin(w) + x2 * Math.sin(2 * w));
    return re * re + im * im;
  };
  return mag(b0, b1, b2) / mag(a0, a1, a2);
}

/** The filters the spec turns on, as biquads. */
export function eqBiquads(spec: EqSpec): Biquad[] {
  const filters: Biquad[] = [];
  if (spec.lowCut && usable(spec.lowCut.q)) filters.push(highPass(spec.lowCut.frequency, spec.lowCut.q));
  if (spec.highCut && usable(spec.highCut.q)) filters.push(lowPass(spec.highCut.frequency, spec.highCut.q));
  for (const b of spec.bands) {
    if (b.on !== false && b.gain !== 0 && usable(b.q)) filters.push(peaking(b.frequency, b.q, b.gain));
  }
  return filters;
}

/** The response in dB at one frequency. */
export function eqResponseDb(spec: EqSpec, f: number): number {
  return eqResponseOf(eqBiquads(spec), f);
}

export function eqResponseOf(filters: readonly Biquad[], f: number): number {
  const p = filters.reduce((acc, bq) => acc * power(bq, f), 1);
  return 10 * Math.log10(p);
}

/** `points` log-spaced frequencies from 20 Hz to 20 kHz with the response at each. */
export function eqCurve(spec: EqSpec, points = 200): { f: number; db: number }[] {
  const filters = eqBiquads(spec);
  const ratio = Math.log(EQ_MAX_HZ / EQ_MIN_HZ);
  return Array.from({ length: points }, (_, i) => {
    const f = EQ_MIN_HZ * Math.exp((ratio * i) / (points - 1));
    return { f, db: eqResponseOf(filters, f) };
  });
}
