import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MB_CATALOG, mbCatalog, mbFormatValue, type MbMap } from '../src/index.ts';

const param = (module: string, label: string) =>
  MB_CATALOG.modules
    .find((m) => m.name === module)
    ?.models.flatMap((a) => a.params)
    .filter((p) => p.name === label) ?? [];

test('mbFormatValue: unit, kHz, 2 decimals and no unit', () => {
  assert.equal(mbFormatValue(400, { unit: 'ms' }), '400 ms');
  assert.equal(mbFormatValue(-3.456, { unit: 'dB' }), '-3.46 dB');
  assert.equal(mbFormatValue(1200, { unit: 'Hz' }), '1.2 kHz');
  assert.equal(mbFormatValue(999, { unit: 'Hz' }), '999 Hz');
  assert.equal(mbFormatValue(50, { unit: '%' }), '50 %');
  assert.equal(mbFormatValue(12.3456, {}), '12.35');
});

test('mbCatalog merges units: by module and label, a model key wins, none without an entry', () => {
  const map: MbMap = {
    modules: [
      {
        module: 'DLY',
        index: 9,
        models: [10, 11].map((fxid) => ({
          fxid,
          index: 0,
          type: '',
          basedOn: '',
          params: [
            { id: 0, label: 'Time', min: 20, max: 4000, step: 1, default: 100 },
            { id: 1, label: 'Mix', min: 0, max: 100, step: 1, default: 50 },
          ],
        })),
      },
    ],
  };
  const models = mbCatalog(map, {}, { 'DLY:Time': 'ms', 'DLY:11:Time': 's' }).modules[0]?.models ?? [];
  const [a, b] = [models[0]?.params ?? [], models[1]?.params ?? []];
  assert.deepEqual(
    a.map((p) => p.unit),
    ['ms', undefined],
  );
  assert.deepEqual(
    b.map((p) => p.unit),
    ['s', undefined],
  );
  assert.equal('unit' in (a[1] ?? {}), false);
});

test('units.json: every entry matches a built-in parameter', () => {
  // The delay Time's ms is only implied by its range, not stated by the manual: left without a unit.
  assert.ok(param('DLY', 'Time').length > 0 && param('DLY', 'Time').every((p) => p.unit === undefined));
  assert.ok(param('MOD', 'Detune').length > 0 && param('FREQ', 'Low Pitch').length > 0);
  assert.ok(param('MOD', 'Detune').every((p) => p.unit === 'cents'));
  assert.ok(param('FREQ', 'Low Pitch').every((p) => p.unit === 'st'));
  assert.ok(param('AMP', 'Gain').every((p) => p.unit === undefined));
});
