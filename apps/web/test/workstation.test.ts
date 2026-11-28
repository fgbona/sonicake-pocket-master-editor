import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MbPreset, Preset } from '@pocket-master/core';
import { bankPrefix, presetRole, sharedPrefix, slotRole, withRole } from '../lib/workstation/banks.ts';
import { mbDirtySlots, mbParamDirty, pocketDirtyModules, pocketParamDirty, syncState } from '../lib/workstation/device.ts';

test('sync state: offline, reading, writing, synced and dirty', () => {
  assert.equal(syncState({ linked: false, busy: null, dirty: true }), 'offline');
  assert.equal(syncState({ linked: true, busy: 'Reading', dirty: false }), 'reading');
  assert.equal(syncState({ linked: true, busy: 'Loading', dirty: true }), 'reading');
  assert.equal(syncState({ linked: true, busy: 'Saving', dirty: true }), 'writing');
  assert.equal(syncState({ linked: true, busy: null, dirty: true }), 'dirty');
  assert.equal(syncState({ linked: true, busy: null, dirty: false }), 'synced');
});

const pmBlock = (module: number, on: boolean, values: number[], code = 1) =>
  ({ key: `m${module}`, label: `M${module}`, module, on, model: 'x', code, params: values.map((value, alg) => ({ name: `p${alg}`, alg, kind: 'number', value, display: String(value) })) }) as const;
const pm = (...chain: ReturnType<typeof pmBlock>[]) => ({ volume: 50, bpm: 120, ampMode: 'normal', chain }) as unknown as Preset;

test('Pocket Master: the modules that differ from the restore point are dirty', () => {
  const stored = pm(pmBlock(1, true, [1, 2]), pmBlock(2, false, [3]), pmBlock(3, true, [4], 7));
  const now = pm(pmBlock(1, true, [1, 2]), pmBlock(2, true, [3]), pmBlock(3, true, [4], 8));
  assert.deepEqual([...pocketDirtyModules(now, stored)], [2, 3]);
  assert.deepEqual([...pocketDirtyModules(pm(pmBlock(1, true, [1, 5])), stored)], [1]);
  assert.equal(pocketDirtyModules(now, null).size, 0);
});

const mbBlock = (slot: number, on: boolean, values: number[], fxid = 1) => ({ slot, moduleIndex: 2, fxid, on, values });
const mb = (...chain: ReturnType<typeof mbBlock>[]) => ({ number: 0, name: 'x', style: '', chain, sections: [] }) as unknown as MbPreset;

test('Matribox: the storage slots that differ from the baseline are dirty, a moved block is not', () => {
  const base = mb(mbBlock(0, true, [1, 2]), mbBlock(4, true, [3]));
  assert.equal(mbDirtySlots(mb(mbBlock(4, true, [3]), mbBlock(0, true, [1, 2])), base).size, 0);
  assert.deepEqual([...mbDirtySlots(mb(mbBlock(0, true, [1, 9]), mbBlock(4, false, [3])), base)], [0, 4]);
  assert.deepEqual([...mbDirtySlots(mb(mbBlock(0, true, [1, 2]), mbBlock(4, true, [3]), mbBlock(7, true, [0])), base)], [7]);
  assert.deepEqual([...mbDirtySlots(mb(mbBlock(0, true, [1, 2], 5)), base)], [0]);
});

test('roles come from the name suffix', () => {
  assert.equal(presetRole('MTL-CLEAN'), 'clean');
  assert.equal(presetRole('mtl rhy'), 'rhy');
  assert.equal(presetRole('BLUES_LEAD '), 'lead');
  assert.equal(presetRole('Leaders'), null);
  assert.equal(bankPrefix('MTL-RHY'), 'MTL');
  assert.equal(bankPrefix('Drive AD'), 'Drive AD');
});

test('withRole keeps the prefix and fits the name limit', () => {
  assert.equal(withRole('MTL-RHY', 'lead', 10), 'MTL-LEAD');
  assert.equal(withRole('MTL', 'clean', 10), 'MTL-CLEAN');
  assert.equal(withRole('BlackAlbum', 'clean', 10), 'Blac-CLEAN');
  assert.equal(withRole('', 'rhy', 10), 'RHY');
  assert.ok(withRole('Long preset name', 'clean', 16).length <= 16);
});

test('a bank shares a prefix only when its role-named presets agree', () => {
  assert.equal(sharedPrefix(['MTL-CLEAN', 'MTL-RHY', 'MTL-LEAD', 'spare']), 'MTL');
  assert.equal(sharedPrefix(['MTL-CLEAN', 'GNR-RHY']), null);
  assert.equal(sharedPrefix(['Drive AD', 'Clean']), null);
});

test('a slot takes its role from its place in the bank; a fourth slot is free', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => slotRole(i, 4)),
    ['clean', 'rhy', 'lead', 'free', 'clean'],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => slotRole(i, 3)),
    ['clean', 'rhy', 'lead', 'clean'],
  );
});

test('a parameter is edited when it differs from the stored value, or its block changed model', () => {
  const stored = pm(pmBlock(1, true, [1, 2], 7));
  assert.equal(pocketParamDirty(pm(pmBlock(1, true, [1, 3], 7)), stored, 1, 1, 3), true);
  assert.equal(pocketParamDirty(pm(pmBlock(1, true, [1, 3], 7)), stored, 1, 0, 1), false);
  assert.equal(pocketParamDirty(pm(pmBlock(1, true, [1, 2], 8)), stored, 1, 0, 1), true);
  assert.equal(pocketParamDirty(stored, null, 1, 0, 9), false);
  const base = mb(mbBlock(0, true, [1, 2]));
  assert.equal(mbParamDirty(mb(mbBlock(0, true, [1, 5])), base, 0, 1, 5), true);
  assert.equal(mbParamDirty(mb(mbBlock(0, true, [1, 5])), base, 0, 0, 1), false);
  assert.equal(mbParamDirty(mb(mbBlock(0, true, [1, 2], 9)), base, 0, 0, 1), true);
  assert.equal(mbParamDirty(mb(mbBlock(3, true, [0])), base, 3, 0, 0), true);
});
