import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMbFrame, readFloat32LE } from '../src/matribox/frame.ts';
import { unwrapMbMessage } from '../src/matribox/message.ts';
import {
  MB_FS_FUNCTIONS,
  MB_QK_BPM,
  MB_QK_VOLUME,
  mbAssignCtrl,
  mbAssignExpression,
  mbAssignQuickKnob,
  mbClearExpression,
  mbExpressionWrites,
  mbSetExpressionMax,
  mbSetExpressionMin,
  mbSetFootswitchFunction,
  mbSetPatchVolume,
} from '../src/matribox/write.ts';
import { fromHex, toHex } from '../src/hex.ts';
import { parseMbPreset } from '../src/matribox/preset.ts';
import { mbAssignments, mbFootswitchToggleWrites, mbFsFunctionId, mbFsFunctionName, withMbVolume } from '../src/matribox/assignments.ts';
import { isMbControlChange, MB_CC, mbBpmControlChanges, mbControlChange, mbSwitch } from '../src/matribox/cc.ts';

// Host frames the official editor sent (captures mb-01, mb-04, mb-09), by name.
const HOST = new Map(
  readFileSync(new URL('./fixtures/matribox-controls.txt', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf(' ')), fromHex(l.slice(l.indexOf(' ') + 1))] as const),
);

const host = (name: string) => {
  const frame = HOST.get(name);
  assert.ok(frame, `fixture has ${name}`);
  return frame;
};
/** The f32 the captured frame carries at data offset `at` (the editor's slider values are not round numbers). */
const capturedFloat = (name: string, at: number) => readFloat32LE(unwrapMbMessage(parseMbFrame(host(name)).payload).data, at);

test('patch volume rebuilds the captured frames byte for byte', () => {
  assert.equal(toHex(mbSetPatchVolume(52)), toHex(host('volume-52')));
  assert.equal(toHex(mbSetPatchVolume(77)), toHex(host('volume-77')));
});

test('patch volume is an integer 0..100', () => {
  for (const bad of [-1, 101, 50.5, Number.NaN]) assert.throws(() => mbSetPatchVolume(bad), RangeError);
  assert.doesNotThrow(() => mbSetPatchVolume(0));
  assert.doesNotThrow(() => mbSetPatchVolume(100));
});

test('CTRL membership rebuilds the captured "footswitch A" frames byte for byte (FS A runs CTRL 1 by default)', () => {
  assert.equal(toHex(mbAssignCtrl(0, 0, true)), toHex(host('fs-A-slot0-assign')));
  assert.equal(toHex(mbAssignCtrl(0, 0, false)), toHex(host('fs-A-slot0-unassign')));
  assert.equal(toHex(mbAssignCtrl(0, 1, true)), toHex(host('fs-A-slot1-assign')));
});

test('CTRL membership checks the CTRL (1..4 as 0..3) and the slot', () => {
  assert.throws(() => mbAssignCtrl(4, 0, true), RangeError);
  assert.throws(() => mbAssignCtrl(-1, 0, true), RangeError);
  assert.throws(() => mbAssignCtrl(0, 12, true), RangeError);
  assert.doesNotThrow(() => mbAssignCtrl(3, 11, false));
});

/** The message data of a write frame, as hex without spaces. */
const dataHex = (frame: Uint8Array) => Buffer.from(unwrapMbMessage(parseMbFrame(frame).payload).data).toString('hex');

test("footswitch function: waveod's 01/02 00 03 01 + u32 switch + u32 function (press / hold, stomp mode)", () => {
  assert.equal(dataHex(mbSetFootswitchFunction(1, 8)), '01000301' + '01000000' + '08000000');
  assert.equal(dataHex(mbSetFootswitchFunction(3, 7, true)), '02000301' + '03000000' + '07000000');
  assert.equal(dataHex(mbSetFootswitchFunction(0, 0)), '01000301' + '00000000' + '00000000');
  for (const [fs, fn] of [
    [4, 1],
    [-1, 1],
    [0, 21],
    [0, 24],
    [0, 1.5],
  ] as const) {
    assert.throws(() => mbSetFootswitchFunction(fs, fn), RangeError, `${fs} ${fn}`);
  }
});

test("footswitch function names: the official editor's list, found by name in any case", () => {
  assert.equal(MB_FS_FUNCTIONS.length, 21);
  assert.equal(mbFsFunctionName(1), 'CTRL 1');
  assert.equal(mbFsFunctionName(8), 'tap tempo');
  assert.equal(mbFsFunctionName(26), 'block in slot 3');
  assert.equal(mbFsFunctionId('Tap Tempo'), 8);
  assert.equal(mbFsFunctionId(' ctrl 4 '), 4);
  assert.equal(mbFsFunctionId('none'), 0);
  assert.throws(() => mbFsFunctionId('boost'), /tap tempo/);
});

test("quick knob: waveod's 01 00 02 01 (target) then 02 00 02 01 (parameter), u32 knob + u32 value", () => {
  assert.deepEqual(mbAssignQuickKnob(0, 4, 2).map(dataHex), ['01000201' + '00000000' + '04000000', '02000201' + '00000000' + '02000000']);
  assert.deepEqual(mbAssignQuickKnob(2, MB_QK_VOLUME, 0).map(dataHex), ['01000201' + '02000000' + '0d000000', '02000201' + '02000000' + '00000000']);
  assert.deepEqual(mbAssignQuickKnob(1, null, 0).map(dataHex)[0], '01000201' + '01000000' + 'ffffffff');
  assert.equal(MB_QK_BPM, 12);
  for (const [knob, target, param] of [
    [3, 0, 0],
    [-1, 0, 0],
    [0, 14, 0],
    [0, 0, 15],
    [0, 0, -1],
  ] as const) {
    assert.throws(() => mbAssignQuickKnob(knob, target, param), RangeError, `${knob} ${target} ${param}`);
  }
});

test('expression assignment, min and max rebuild the captured frames byte for byte', () => {
  assert.equal(toHex(mbAssignExpression({ entry: 0, slot: 0, paramId: 0, min: 0, max: 100 })), toHex(host('exp-assign-entry0-slot0-param0')));
  assert.equal(toHex(mbSetExpressionMin(0, capturedFloat('exp-min-entry0', 12))), toHex(host('exp-min-entry0')));
  assert.equal(toHex(mbSetExpressionMax(0, capturedFloat('exp-max-entry0', 12))), toHex(host('exp-max-entry0')));
});

test("expression assignment field order, as the owner's unit took it (2026-11-24): group, position, slot, param", () => {
  // Checked live: (1,0,1,0) landed in entry 4 (group 1 = EXP 1 mode B, position 0) on slot 1 (AMP),
  // (0,0,1,1) in entry 1 on slot 1 parameter 1 (AMP Volume). Entry 0..8 = group * 3 + position.
  const data = (frame: Uint8Array) => toHex(frame).replace(/ /g, '');
  const body = (vals: number[]) => vals.map((v) => [v, 0, 0, 0].map((b) => b.toString(16).padStart(2, '0')).join('')).join('');
  const sent = (frame: Uint8Array) => unwrapMbMessage(parseMbFrame(frame).payload).data;
  assert.equal(Buffer.from(sent(mbAssignExpression({ entry: 3, slot: 1, paramId: 0, min: 0, max: 100 })).subarray(4, 20)).toString('hex'), body([1, 0, 1, 0]));
  assert.equal(Buffer.from(sent(mbAssignExpression({ entry: 0, slot: 1, paramId: 1, min: 0, max: 100 })).subarray(4, 20)).toString('hex'), body([0, 0, 1, 1]));
  assert.equal(Buffer.from(sent(mbAssignExpression({ entry: 8, slot: 11, paramId: 14, min: 0, max: 100 })).subarray(4, 20)).toString('hex'), body([2, 2, 11, 14]));
  assert.equal(Buffer.from(sent(mbSetExpressionMin(4, 10)).subarray(4, 12)).toString('hex'), body([1, 1]));
  void data;
});

test('an expression assignment goes with the full range, the ends that differ follow (the unit ignores the range in it)', () => {
  const a = { entry: 4, slot: 4, paramId: 1, min: 20, max: 80 };
  assert.deepEqual(mbExpressionWrites(a).map(toHex), [mbAssignExpression({ ...a, min: 0, max: 100 }), mbSetExpressionMin(4, 20), mbSetExpressionMax(4, 80)].map(toHex));
  assert.equal(mbExpressionWrites({ ...a, min: 0, max: 100 }).length, 1);
  assert.throws(() => mbExpressionWrites({ ...a, min: 90, max: 10 }), /min \(90\) must not be above max/);
});

test('expression writes check the entry, slot, parameter and the 0..100 range', () => {
  const ok = { entry: 8, slot: 11, paramId: 14, min: 0, max: 100 };
  assert.doesNotThrow(() => mbAssignExpression(ok));
  for (const bad of [{ entry: 9 }, { slot: 12 }, { paramId: 15 }, { min: -1 }, { max: 100.5 }, { min: Number.NaN }]) {
    assert.throws(() => mbAssignExpression({ ...ok, ...bad }), RangeError, JSON.stringify(bad));
  }
  assert.throws(() => mbSetExpressionMin(9, 10), RangeError);
  assert.throws(() => mbSetExpressionMax(0, 101), RangeError);
});

// The owner's "Drive AD" (decompressed device reply).
const DRIVE_AD = parseMbPreset(
  fromHex(
    readFileSync(new URL('./fixtures/matribox-preset-drive-ad.txt', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .join(''),
  ),
);

test('mbAssignments reads volume, tempo, footswitch functions, CTRL groups, quick knobs and expression entries', () => {
  const a = mbAssignments(DRIVE_AD);
  assert.equal(a.volume, 45);
  assert.equal(a.tempo, 120);
  assert.equal(a.expressionMode, 0);
  assert.deepEqual(a.expression[0], { entry: 0, slot: 5, paramId: 0, min: 0, max: 100 });
  assert.equal(a.expression.filter((e) => e.slot !== null).length, 1);
  // Section 3: the factory functions, FS A..D press = CTRL 1..4, no hold.
  assert.deepEqual(
    a.footswitches,
    [1, 2, 3, 4].map((press) => ({ press, hold: 0 })),
  );
  assert.equal(a.ctrl.length, 4);
  assert.deepEqual(a.ctrl[0], [1]);
  // Section 2: knob 1 on slot 0 (DRV) parameter 0, knob 2 on slot 2, knob 3 on the patch volume.
  assert.deepEqual(a.quickKnobs, [
    { knob: 0, target: 0, paramId: 0 },
    { knob: 1, target: 2, paramId: 0 },
    { knob: 2, target: MB_QK_VOLUME, paramId: 0 },
  ]);
});

test('a footswitch toggles a block through the CTRL its press runs; a switch on anything else is set to its own CTRL first', () => {
  const a = mbAssignments(DRIVE_AD);
  assert.deepEqual(mbFootswitchToggleWrites(a, 1, 4, true).map(toHex), [toHex(mbAssignCtrl(1, 4, true))]);
  const remapped = { ...a, footswitches: [{ press: 3, hold: 0 }, { press: 8, hold: 0 }, ...a.footswitches.slice(2)] };
  assert.deepEqual(mbFootswitchToggleWrites(remapped, 0, 4, true).map(toHex), [toHex(mbAssignCtrl(2, 4, true))]);
  assert.deepEqual(mbFootswitchToggleWrites(remapped, 1, 4, true).map(toHex), [toHex(mbSetFootswitchFunction(1, 2)), toHex(mbAssignCtrl(1, 4, true))]);
  assert.deepEqual(mbFootswitchToggleWrites(remapped, 1, 4, false), []);
  assert.throws(() => mbFootswitchToggleWrites(a, 4, 0, true), RangeError);
});

test('withMbVolume changes the volume only, leaving the preset as it was', () => {
  const louder = withMbVolume(DRIVE_AD, 80);
  assert.equal(mbAssignments(louder).volume, 80);
  assert.equal(mbAssignments(DRIVE_AD).volume, 45);
  assert.equal(mbAssignments(louder).tempo, 120);
});

test('Control Change messages: channel 1..16, 7-bit controller and value', () => {
  assert.deepEqual([...mbControlChange(1, MB_CC.tuner, mbSwitch(true))], [0xb0, 58, 127]);
  assert.deepEqual([...mbControlChange(16, MB_CC.tapTempo, 127)], [0xbf, 70, 127]);
  for (const [ch, cc, v] of [
    [0, 1, 1],
    [17, 1, 1],
    [1, 128, 1],
    [1, 1, 128],
    [1, 1, 1.5],
  ] as const) {
    assert.throws(() => mbControlChange(ch, cc, v), RangeError);
  }
  assert.equal(isMbControlChange(mbControlChange(3, 7, 50)), true);
  assert.equal(isMbControlChange(Uint8Array.of(0x90, 60, 100)), false);
});

test('BPM is sent as CC 68 (MSB) and CC 69 (LSB), 40..300', () => {
  assert.deepEqual(
    mbBpmControlChanges(1, 120).map((m) => [...m]),
    [
      [0xb0, 68, 0],
      [0xb0, 69, 120],
    ],
  );
  assert.deepEqual(
    mbBpmControlChanges(1, 300).map((m) => [...m]),
    [
      [0xb0, 68, 2],
      [0xb0, 69, 44],
    ],
  );
  assert.deepEqual(
    mbBpmControlChanges(2, 128).map((m) => [...m]),
    [
      [0xb1, 68, 1],
      [0xb1, 69, 0],
    ],
  );
  for (const bad of [39, 301, 120.5]) assert.throws(() => mbBpmControlChanges(1, bad), RangeError);
});

test('an expression entry is cleared with slot -1 (none), as the quick knob takes it', () => {
  const sent = (frame: Uint8Array) => Buffer.from(unwrapMbMessage(parseMbFrame(frame).payload).data);
  const d = sent(mbClearExpression(4));
  assert.equal(d.subarray(0, 4).toString('hex'), '02000701');
  assert.equal(d.subarray(4, 20).toString('hex'), '01000000' + '01000000' + 'ffffffff' + '00000000');
  assert.throws(() => mbClearExpression(9), /entry must be 0\.\.8/);
});
