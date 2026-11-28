import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressorCurve, delayTaps, eqCurve, isGate, isSynced, reverbEnvelope, sweepRange, unitPath, type VizBlock } from '../lib/blockViz.ts';

const p = (name: string, value: number, min = 0, max = 100) => ({ name, value, min, max });
const at = <T>(a: readonly T[], i: number): T => {
  const v = a[i];
  assert.ok(v !== undefined);
  return v;
};
const block = (params: ReturnType<typeof p>[], name = 'X', type = ''): VizBlock => ({ params, model: { name, type } });

test('a higher compressor ratio flattens the slope above the threshold', () => {
  const soft = compressorCurve(block([p('Threshold', 50), p('Ratio', 10)]));
  const hard = compressorCurve(block([p('Threshold', 50), p('Ratio', 90)]));
  assert.deepEqual(soft.knee, hard.knee);
  assert.ok(at(at(hard.points, 2), 1) < at(at(soft.points, 2), 1));
  assert.ok(at(at(hard.points, 2), 1) >= hard.knee[1]);
});

test('more delay feedback gives more and taller taps; a longer time spaces them wider', () => {
  const delay = (time: number, fb: number) => delayTaps(block([p('Mix', 50), p('Time', time, 20, 4000), p('Feedback', fb)]));
  const low = delay(1000, 20);
  const high = delay(1000, 80);
  assert.ok(high.taps.length > low.taps.length);
  assert.ok(at(at(high.taps, 1), 1) > (low.taps[1]?.[1] ?? 0));
  const gap = (t: readonly (readonly [number, number])[]) => at(at(t, 1), 0) - at(at(t, 0), 0);
  assert.ok(gap(delay(3000, 80).taps) > gap(delay(300, 80).taps));
});

test('a negative feedback decays by its size', () => {
  const neg = delayTaps(block([p('Time', 500, 20, 4000), p('Feedback', -60, -100, 100)]));
  const pos = delayTaps(block([p('Time', 500, 20, 4000), p('Feedback', 60, -100, 100)]));
  assert.deepEqual(neg.taps, pos.taps);
});

test('sync is read from the Sync switch', () => {
  assert.equal(isSynced(block([p('Sync', 1, 0, 1)])), true);
  assert.equal(isSynced(block([p('Sync', 0, 0, 1)])), false);
  assert.equal(isSynced(block([p('Mix', 50)])), false);
});

test('a longer reverb decay gives a longer tail, and pre delay moves its start', () => {
  const rvb = (decay: number, pre = 0) => reverbEnvelope(block([p('Mix', 50), p('Pre Delay', pre, 0, 300), p('Decay', decay)]));
  assert.ok(rvb(80).end > rvb(20).end);
  assert.ok(rvb(50, 200).start > rvb(50, 0).start);
  assert.ok(rvb(100, 300).end <= 1);
});

test('an EQ at all 50 is flat, and a boosted band lifts its place', () => {
  const bands = (v: number[]) => block(v.map((x, i) => p(`${i}00Hz`, x, -50, 50)).concat(p('Volume', 50)));
  // Range -50..50: the middle of the range (0) is flat.
  const flat = eqCurve(bands([0, 0, 0, 0, 0]));
  assert.ok(flat.every(([, y]) => y === 0.5));
  const boosted = eqCurve(bands([0, 0, 50, 0, 0]));
  assert.ok(at(at(boosted, 24), 1) > 0.5);
  const zeroToHundred = eqCurve(block([p('100Hz', 50), p('1kHz', 50)]));
  assert.ok(zeroToHundred.every(([, y]) => y === 0.5));
});

test('unknown parameters degrade to a drawable default', () => {
  assert.ok(compressorCurve(block([])).points.length === 3);
  assert.ok(delayTaps(block([])).taps.length > 0);
  assert.ok(reverbEnvelope(block([p('Mix', Number.NaN)])).end > 0);
});

test('gate models are told apart by name or type', () => {
  assert.equal(isGate(block([], 'Noise Gate')), true);
  assert.equal(isGate(block([], 'X', 'Gate')), true);
  assert.equal(isGate(block([], 'Comp', 'Comp')), false);
});

test('sweep range orders min and max and path flips y', () => {
  assert.deepEqual(sweepRange(80, 20), [0.2, 0.8]);
  assert.equal(
    unitPath(
      [
        [0, 0],
        [1, 1],
      ],
      100,
      50,
      0,
    ),
    'M0 50 L100 0',
  );
});
