import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMbFrame } from '../src/matribox/frame.ts';
import { unwrapMbMessage } from '../src/matribox/message.ts';
import { fromHex, toHex } from '../src/hex.ts';
import { matriboxLink } from '../src/matribox/link.ts';
import {
  MB_GLOBALS,
  mbReadGlobalState,
  mbSetGlobal,
  mbSetGlobalEqFrequency,
  mbSetGlobalEqGain,
  mbSetGlobalEqQ,
  mbSetGlobalEqLevel,
  mbSetGlobalEqOn,
  mbWriteGlobalEqOn,
  parseMbGlobalEq,
  parseMbGlobalEqOn,
  parseMbGlobals,
} from '../src/matribox/globals.ts';
import { FakeMatribox } from './fake-matribox.ts';

// Frames of the official editor's global settings window (captures mb-30 … mb-39), by name.
const FRAMES = new Map(
  readFileSync(new URL('./fixtures/matribox-globals.txt', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf(' ')), fromHex(l.slice(l.indexOf(' ') + 1))] as const),
);
const captured = (name: string) => {
  const frame = FRAMES.get(name);
  assert.ok(frame, `fixture has ${name}`);
  return toHex(frame);
};
const dataOf = (name: string) => unwrapMbMessage(parseMbFrame(fromHex(captured(name))).payload).data;

test('the global setting writes rebuild the captured host frames byte for byte', () => {
  assert.equal(toHex(mbSetGlobal('inputLevel', 5)), captured('input-level-5'));
  assert.equal(toHex(mbSetGlobal('auxLevel', 80)), captured('aux-level-80'));
  assert.equal(toHex(mbSetGlobal('currentMode', 1)), captured('current-mode-1'));
  assert.equal(toHex(mbSetGlobal('midiInTrs', 5)), captured('midi-in-trs-5')); // `00 61`: the TRS input (owner's label said USB)
  assert.equal(toHex(mbSetGlobal('midiSource', 1)), captured('midi-source-1'));
  assert.equal(toHex(mbSetGlobal('inputMode', 2)), captured('input-mode-2'));
});

test('the global EQ writes rebuild the captured host frames byte for byte', () => {
  assert.equal(toHex(mbSetGlobalEqGain(1, 3)), captured('eq-band2-gain-3'));
  assert.equal(toHex(mbSetGlobalEqLevel(70)), captured('eq-level-70'));
  assert.equal(toHex(mbSetGlobalEqOn(false)), captured('eq-on-0'));
  assert.equal(toHex(mbSetGlobalEqOn(true)), captured('eq-on-1'));
});

const sentData = (frame: Uint8Array) => toHex(unwrapMbMessage(parseMbFrame(frame).payload).data);

test('the writes not captured follow the same rules: channel index, tempo, every band gain', () => {
  // The low byte of the setting is its index: MIDI In USB is the second channel of `61`.
  assert.equal(sentData(mbSetGlobal('midiInUsb', 5)), '01 61 00 00 05 00 00 00');
  assert.equal(sentData(mbSetGlobal('tempoOn', 1)), '00 25 00 00 01 00 00 00');
  assert.equal(sentData(mbSetGlobal('tempoBpm', 120)), '00 26 00 00 78 00 00 00');
  // Band gains are words 10, 14, 18, 22 (band 2 captured at 14).
  assert.deepEqual(
    [0, 1, 2, 3].map((b) => sentData(mbSetGlobalEqGain(b, 0)).slice(0, 2)),
    ['0A', '0E', '12', '16'],
  );
});

test('the unit answers the EQ switch with 00 00 00 00 + u32, not an echo', () => {
  assert.equal(parseMbGlobalEqOn(dataOf('eq-on-answer-0')), false);
  assert.equal(parseMbGlobalEqOn(dataOf('eq-on-answer-1')), true);
  assert.throws(() => parseMbGlobalEqOn(dataOf('eq-on-1')), /EQ switch/); // the request itself is not an answer
});

test('writes outside what was captured are refused before anything is sent', () => {
  assert.throws(() => mbSetGlobal('midiSource', 0), /midiSource/); // TRS Only: the editor's Control Changes need USB
  assert.throws(() => mbSetGlobal('inputLevel', 21), /inputLevel/);
  assert.throws(() => mbSetGlobal('inputLevel', 1.5), /inputLevel/);
  assert.throws(() => mbSetGlobal('midiInUsb', 17), /midiInUsb/);
  assert.throws(() => mbSetGlobal('tempoBpm', 39), /tempoBpm/);
  assert.throws(() => mbSetGlobal('tempoBpm', 301), /tempoBpm/);
  assert.throws(() => mbSetGlobal('tempoOn', 2), /tempoOn/);
  assert.throws(() => mbSetGlobalEqGain(4, 0), /band/);
  assert.throws(() => mbSetGlobalEqGain(0, 21), /gain/);
  assert.throws(() => mbSetGlobalEqLevel(101), /level/);
  assert.throws(() => mbSetGlobalEqLevel(Number.NaN), /level/);
});

test('a negative input level goes as a two-complement int32 and reads back from its byte', () => {
  const data = unwrapMbMessage(parseMbFrame(mbSetGlobal('inputLevel', -6)).payload).data;
  assert.equal(toHex(data), '00 21 00 00 FA FF FF FF');
  const table = new Uint8Array(52);
  table[MB_GLOBALS.inputLevel.at] = 0xfa;
  assert.equal(parseMbGlobals(table).inputLevel, -6);
});

/** The general table as the unit sent it in capture mb-38 (bytes shown in docs/matribox.md). */
function generalTable(): Uint8Array {
  const t = new Uint8Array(52);
  for (const [at, v] of [
    [2, 2],
    [5, 1],
    [9, 1],
    [11, 80],
    [14, 5],
    [15, 2],
    [20, 1],
    [21, 1],
    [22, 1],
    [35, 1],
    [36, 5],
    [44, 2],
    [45, 4],
    [47, 80],
    [48, 100],
    [49, 0],
    [50, 1],
  ] as const)
    t[at] = v;
  return t;
}

test('the general table decodes to the settings changed in mb-30 … mb-38', () => {
  assert.deepEqual(parseMbGlobals(generalTable()), {
    inputLevel: 5,
    auxLevel: 80,
    inputMode: 2,
    currentMode: 1,
    midiInTrs: 5,
    midiInUsb: 0,
    midiSource: 2,
    tempoOn: 1,
    tempoBpm: 100,
    brightness: 80,
    // From waveod's layout, as the owner's unit holds them: Auto CAB on, USB records AUX and both channels processed, mixed clock.
    autoCab: 1,
    usbRecLevel: 0,
    usbMonitorLevel: 0,
    usbRecAux: 1,
    usbRecWetL: 1,
    usbRecWetR: 1,
    exp2Jack: 0,
    extFs1: 0,
    extFs2: 0,
    bankMode: 0,
    midiOutTrs: 0,
    midiOutUsb: 0,
    clockSource: 4,
    clockOut: 0,
  });
  const off = generalTable();
  off.set([0xff, 0xff, 0], 48); // the first sessions: never set, off
  off.set([9, 0], 38); // MIDI In USB is an i16 at 38
  assert.deepEqual([parseMbGlobals(off).tempoOn, parseMbGlobals(off).tempoBpm, parseMbGlobals(off).midiInUsb], [0, 0xffff, 9]);
  assert.throws(() => parseMbGlobals(new Uint8Array(51)), /52/);
});

test('the settings from waveod: index and id as the firmware takes them, signed values two-complement', () => {
  assert.equal(sentData(mbSetGlobal('autoCab', 0)), '00 05 00 00 00 00 00 00');
  assert.equal(sentData(mbSetGlobal('usbRecLevel', -3)), '00 31 00 00 FD FF FF FF');
  assert.equal(sentData(mbSetGlobal('usbRecWetR', 0)), '01 34 00 00 00 00 00 00');
  assert.equal(sentData(mbSetGlobal('exp2Jack', 2)), '01 41 00 00 02 00 00 00');
  assert.equal(sentData(mbSetGlobal('extFs2', 8)), '02 42 00 00 08 00 00 00');
  assert.equal(sentData(mbSetGlobal('midiOutUsb', -1)), '03 61 00 00 FF FF FF FF'); // off
  assert.equal(sentData(mbSetGlobal('clockOut', 3)), '00 64 00 00 03 00 00 00');
  assert.throws(() => mbSetGlobal('clockSource', 5), RangeError);
  const t = new Uint8Array(52);
  t.set([0xff, 0xff], 42);
  t[18] = 0xfb;
  assert.deepEqual([parseMbGlobals(t).midiOutUsb, parseMbGlobals(t).usbRecLevel], [-1, -5]);
});

test('the global EQ table decodes to its cuts, shelves, bands and level', () => {
  const words = [1, 80, 0.71, 0, 20, 0.71, 0, 1, 250, 1, -1, 1, 500, 0.71, 3, 1, 1000, 0.71, 0, 1, 5000, 1, 1, 0, 20000, 0.71, 0, 1, 8000, 0.71, 70];
  const eq = parseMbGlobalEq(new Uint8Array(new Float32Array(words).buffer));
  assert.equal(eq.level, 70);
  assert.deepEqual(
    eq.bands.map((b) => [b.on, b.frequency, b.gain]),
    [
      [true, 250, -1],
      [true, 500, 3],
      [true, 1000, 0],
      [true, 5000, 1],
    ],
  );
  assert.equal(Math.round(eq.bands[1]!.q * 100), 71);
  // Words 0..2 low cut, 3..6 low shelf, 23..26 high shelf, 27..29 high cut.
  assert.deepEqual([eq.lowCut.on, eq.lowCut.frequency, eq.lowShelf.on, eq.lowShelf.frequency], [true, 80, false, 20]);
  assert.deepEqual([eq.highShelf.on, eq.highShelf.frequency, eq.highCut.on, eq.highCut.frequency], [false, 20000, true, 8000]);
  assert.equal(Math.round(eq.highCut.q * 100), 71);
  assert.throws(() => parseMbGlobalEq(new Uint8Array(120)), /124/);
});

const key = (frame: Uint8Array) => toHex(frame).replaceAll(' ', '').toLowerCase();
const linked = (fake: FakeMatribox) => matriboxLink({ send: (b) => fake.send(b), listen: (r) => fake.listen(r ?? (() => undefined)) }, 1000);

test('the link reads the globals from the simulated unit and every write is confirmed and kept', async () => {
  const fake = new FakeMatribox(); // its noise (a flag-0 cmd 0x11 message) must not pass for the 52-byte table
  const link = linked(fake);
  const before = await mbReadGlobalState(link);
  assert.equal(before.general.midiSource, 2);
  assert.equal(before.eqOn, true);
  await link.write(mbSetGlobal('inputLevel', -3));
  await link.write(mbSetGlobal('midiInUsb', 7));
  await link.write(mbSetGlobal('tempoBpm', 120));
  await link.write(mbSetGlobal('tempoOn', 1));
  await link.write(mbSetGlobalEqGain(1, 3));
  await link.write(mbSetGlobalEqGain(3, -4));
  await link.write(mbSetGlobalEqLevel(70));
  await link.write(mbSetGlobalEqFrequency(1, 600));
  await link.write(mbSetGlobalEqQ(1, 2));
  await link.write(mbSetGlobalEqFrequency('lowCut', 120));
  await mbWriteGlobalEqOn(link, false);
  const after = await mbReadGlobalState(link);
  assert.equal(after.general.inputLevel, -3);
  assert.equal(after.general.midiInUsb, 7);
  assert.equal(after.general.midiInTrs, 0);
  assert.deepEqual([after.general.tempoOn, after.general.tempoBpm], [1, 120]);
  assert.equal(after.eq.bands[1]?.gain, 3);
  assert.equal(after.eq.bands[3]?.gain, -4);
  assert.equal(after.eq.level, 70);
  assert.deepEqual([after.eq.bands[1]?.frequency, after.eq.bands[1]?.q, after.eq.lowCut.frequency], [600, 2, 120]);
  assert.equal(after.eqOn, false);
});

test('an EQ switch the unit does not take is an error', async () => {
  const fake = new FakeMatribox();
  fake.ignoresEqSwitch = true;
  await assert.rejects(mbWriteGlobalEqOn(linked(fake), false), /global EQ/);
});

test('switching the EQ to the state it is in sends no write (the unit would not answer it)', async () => {
  const fake = new FakeMatribox();
  await mbWriteGlobalEqOn(linked(fake), true); // already on
  assert.ok(!fake.received.includes(key(mbSetGlobalEqOn(true))), 'no switch write sent');
});

test('Global Tempo cannot be switched on before it has a BPM: the unit answers 0, not an echo', async () => {
  const fake = new FakeMatribox(); // BPM never set
  await assert.rejects(linked(fake).write(mbSetGlobal('tempoOn', 1)), /did not confirm/);
  assert.equal(fake.globals.general[MB_GLOBALS.tempoOn.at], 0);
});

// Not captured from the official editor: the words follow the documented layout (docs/matribox.md).
test('EQ frequency and Q writes go to the words of the layout', () => {
  const word = (f: Uint8Array) => sentData(f).slice(0, 2);
  assert.deepEqual(
    [0, 1, 2, 3].map((b) => word(mbSetGlobalEqFrequency(b, 500))),
    ['08', '0C', '10', '14'],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((b) => word(mbSetGlobalEqQ(b, 1))),
    ['09', '0D', '11', '15'],
  );
  assert.equal(word(mbSetGlobalEqFrequency('lowCut', 80)), '01');
  assert.equal(word(mbSetGlobalEqFrequency('highCut', 8000)), '1C');
  assert.doesNotThrow(() => mbSetGlobalEqFrequency('lowCut', 19));
  assert.doesNotThrow(() => mbSetGlobalEqFrequency('highCut', 20001));
});

test('EQ frequency and Q writes refuse values outside their ranges', () => {
  assert.throws(() => mbSetGlobalEqFrequency(4, 500), /band/);
  assert.throws(() => mbSetGlobalEqFrequency(0, 19), /frequency/);
  assert.throws(() => mbSetGlobalEqFrequency(0, 20001), /frequency/);
  assert.throws(() => mbSetGlobalEqFrequency('lowCut', 1001), /low cut/);
  assert.throws(() => mbSetGlobalEqFrequency('lowCut', 18), /low cut/);
  assert.throws(() => mbSetGlobalEqFrequency('highCut', 999), /high cut/);
  assert.throws(() => mbSetGlobalEqFrequency('highCut', 20002), /high cut/);
  assert.throws(() => mbSetGlobalEqQ(0, 0.05), /Q/);
  assert.throws(() => mbSetGlobalEqQ(0, 11), /Q/);
  assert.throws(() => mbSetGlobalEqQ(-1, 1), /band/);
});
