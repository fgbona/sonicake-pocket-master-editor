import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eqCurve, eqResponseDb, type EqSpec } from '../lib/eqCurve.ts';

const flat: EqSpec = {
  bands: [
    { frequency: 250, gain: 0, q: 1 },
    { frequency: 500, gain: 0, q: 1 },
    { frequency: 1000, gain: 0, q: 1 },
    { frequency: 5000, gain: 0, q: 1 },
  ],
};
const near = (actual: number, expected: number, tol: number) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} is not within ${tol} of ${expected}`);

test('flat bands are 0 dB everywhere', () => {
  for (const { db } of eqCurve(flat)) near(db, 0, 1e-9);
});

test('a +6 dB band peaks near +6 dB at its centre frequency', () => {
  const spec: EqSpec = { bands: [{ frequency: 1000, gain: 6, q: 1 }] };
  near(eqResponseDb(spec, 1000), 6, 0.05);
  assert.ok(eqResponseDb(spec, 100) < 1);
  assert.ok(eqResponseDb(spec, 10000) < 1);
});

test('two bands add up, and a band that is off adds nothing', () => {
  const a: EqSpec = { bands: [{ frequency: 1000, gain: 6, q: 1 }] };
  const both: EqSpec = {
    bands: [
      { frequency: 1000, gain: 6, q: 1 },
      { frequency: 1000, gain: 3, q: 1 },
    ],
  };
  near(eqResponseDb(both, 1000), 9, 0.1);
  const off: EqSpec = {
    bands: [
      { frequency: 1000, gain: 6, q: 1 },
      { frequency: 1000, gain: 9, q: 1, on: false },
    ],
  };
  near(eqResponseDb(off, 1000), eqResponseDb(a, 1000), 1e-9);
});

test('a Lo Cut is -3 dB at its corner and far lower below it', () => {
  const spec: EqSpec = { bands: [], lowCut: { frequency: 100, q: Math.SQRT1_2 } };
  near(eqResponseDb(spec, 100), -3, 0.1);
  assert.ok(eqResponseDb(spec, 50) < -10);
  assert.ok(eqResponseDb(spec, 25) < -20);
  near(eqResponseDb(spec, 5000), 0, 0.1);
});

test('a Hi Cut is -3 dB at its corner and lower above it', () => {
  const spec: EqSpec = { bands: [], highCut: { frequency: 8000, q: Math.SQRT1_2 } };
  near(eqResponseDb(spec, 8000), -3, 0.1);
  assert.ok(eqResponseDb(spec, 16000) < -10);
  near(eqResponseDb(spec, 200), 0, 0.1);
});

test('the curve runs from 20 Hz to 20 kHz on a log scale', () => {
  const c = eqCurve(flat, 5);
  near(c[0]!.f, 20, 1e-9);
  near(c[4]!.f, 20000, 1e-6);
  near(c[2]!.f, Math.sqrt(20 * 20000), 1e-6);
});

test('a lower Q makes a wider peak, and a filter with no usable Q is left out', () => {
  const wide: EqSpec = { bands: [{ frequency: 1000, gain: 6, q: 0.5 }] };
  const narrow: EqSpec = { bands: [{ frequency: 1000, gain: 6, q: 4 }] };
  assert.ok(eqResponseDb(wide, 2000) > eqResponseDb(narrow, 2000) + 1);
  near(eqResponseDb({ bands: [{ frequency: 1000, gain: 6, q: 0 }] }, 1000), 0, 1e-9);
});
