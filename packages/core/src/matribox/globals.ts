/**
 * The Matribox II Pro's global settings (docs/matribox.md, "Global settings"), decoded from the
 * official editor's global settings window (captures mb-30 … mb-39, 2026-11-25).
 *
 * - The general table: flag 0, cmd 0x11, no argument; 52 bytes, one byte per setting.
 * - One setting: flag 1, cmd 0x11, `<index> <id> 00 00` + i32 value; the unit echoes it. The unit sends
 *   the same message by itself when the setting changes on the unit (capture 2: Current Mode). `<index> <id>`
 *   is a u16 whose high byte is the setting and low byte its channel (MIDI: 0 In TRS, 1 In USB); index 0
 *   for the rest. The unit leaves out an answer equal to the one before it within 150 ms (the link's
 *   timeout covers it).
 * - The global EQ table: flag 0, cmd 0x16, no argument; 31 float32 LE.
 * - One EQ value: flag 2, cmd 0x16, u32 word index into that table + f32; the unit echoes it.
 * - The EQ switch: flag 1, cmd 0x16, `01 00 00 16` + u32 0/1, read with the same argument; the unit
 *   answers both with `00 00 00 00` + u32, not an echo, and answers nothing when it is already so.
 *
 * Protocol facts cross-checked against zxmarcos/waveod and zxmarcos/matribox-studio (MIT).
 * Never send: flag 1 cmd 0x11 `<n> 90 00 00` (deletes clone capture n); flag 0x0E cmd 0x05 (bootloader).
 *
 * Builders are byte-exact with the captured host frames (test/fixtures/matribox-globals.txt) where a
 * write was captured; the others (MIDI In USB, Global Tempo, EQ bands 1, 3, 4) follow the same rules.
 */
import { buildMbFrame, float32LE, MB_WRITE, readFloat32LE } from './frame.ts';
import type { MatriboxLink } from './link.ts';
import { mbRequest, wrapMbMessage } from './message.ts';

const GENERAL_CMD = 0x11;
const EQ_CMD = 0x16;
export const MB_GENERAL_SIZE = 52;
export const MB_EQ_SIZE = 124;

/** A writable setting: id and index (the write's second and first byte), its byte in the general table, its range. */
export interface MbGlobalDef {
  readonly id: number;
  readonly index: number;
  readonly at: number;
  /** A 16-bit value (bytes `at`, `at + 1`, LE) rather than one byte; signed when `min` is negative. */
  readonly wide: boolean;
  readonly min: number;
  readonly max: number;
}
const def = (id: number, at: number, min: number, max: number, index = 0, wide = false): MbGlobalDef => ({ id, index, at, wide, min, max });

/**
 * The settings the editor writes. MIDI In Source 0 ("TRS Only") is left out: the editor's Control
 * Changes (tuner, tempo) come over USB and would stop.
 */
export const MB_GLOBALS = {
  /** dB, -20..+20 (manual); +5 captured (mb-30), negatives as two-complement. */
  inputLevel: def(0x21, 14, -20, 20),
  /**
   * 0..100 (mb-31). Its byte is 47, not 11: both went from their first values to 80 while AUX Level
   * (0 for the owner) and Brightness (the manual's 50) were changed; 47 was the 0.
   */
  auxLevel: def(0x24, 47, 0, 100),
  /** 0 A.GT, 1 E.GT, 2 Line (the manual's order; 1 and 2 seen). */
  inputMode: def(0x22, 15, 0, 2),
  /** Footswitch mode: 0 Stomp, 1 Preset (mb-33 went Stomp -> Preset with a 1; waveod agrees). */
  currentMode: def(0x52, 35, 0, 1),
  /** MIDI input channel on the TRS jack: 0 Omni, 1..16 (i16; mb-34's write `00 61`). */
  midiInTrs: def(0x61, 36, 0, 16, 0, true),
  /** MIDI input channel on USB: 0 Omni, 1..16 (i16; `01 61`, not captured). */
  midiInUsb: def(0x61, 38, 0, 16, 1, true),
  /** MIDI In Source: 0 TRS Only (read only), 1 USB Only, 2 Mixed. */
  midiSource: def(0x62, 44, 1, 2),
  /** Global Tempo on (1) or off; the unit answers 0 while it has no BPM, and asks on its screen to accept it. */
  tempoOn: def(0x25, 50, 0, 1),
  /** Global Tempo BPM, 40..300 (u16; `FF FF` while never set). The unit sends it when it is turned there (mb-37). */
  tempoBpm: def(0x26, 48, 40, 300, 0, true),
  // The rest from zxmarcos/waveod (editor/global_msgs.c, fw/globals_format.h; MIT), not captured: each is
  // echoed with the value the unit keeps. Left out: USB audio mode (0x06, never answered), language,
  // display and standby, and 0x5101 (the same byte as 0x5100).
  /** Auto CAB: the CAB follows the AMP model (0 off, 1 on). */
  autoCab: def(0x05, 5, 0, 1),
  /** USB recording level, dB -20..+20. */
  usbRecLevel: def(0x31, 18, -20, 20),
  /** USB playback (monitor) level into the outputs, dB -20..+20. */
  usbMonitorLevel: def(0x32, 19, -20, 20),
  /** AUX IN goes into the USB recording too (0/1). */
  usbRecAux: def(0x33, 20, 0, 1),
  /** USB recording channel L (1) / R (2): 0 dry guitar, 1 processed. */
  usbRecWetL: def(0x34, 21, 0, 1, 0),
  usbRecWetR: def(0x34, 22, 0, 1, 1),
  /** What the EXP 2 jack takes: 0 expression pedal, 1 one footswitch, 2 two footswitches. */
  exp2Jack: def(0x41, 24, 0, 2, 1),
  /** Function of external footswitch 1 / 2 on the EXP 2 jack (MB_FS_FUNCTIONS ids). */
  extFs1: def(0x42, 25, 0, 35, 0),
  extFs2: def(0x42, 27, 0, 35, 2),
  /** Bank select mode (manual's "Bank Sel Mode"): 0 Wait, 1 Initial (order assumed from the manual). */
  bankMode: def(0x51, 33, 0, 1),
  /** MIDI output channel on TRS / USB: -1 off, 0 Omni, 1..16 (i16). */
  midiOutTrs: def(0x61, 40, -1, 16, 2, true),
  midiOutUsb: def(0x61, 42, -1, 16, 3, true),
  /** MIDI clock source: 0 internal, 1 TRS only, 2 USB only, 3 external, 4 mixed. */
  clockSource: def(0x63, 45, 0, 4),
  /** MIDI clock out: bit 0 TRS, bit 1 USB. */
  clockOut: def(0x64, 46, 0, 3),
} satisfies Record<string, MbGlobalDef>;
export type MbGlobalSetting = keyof typeof MB_GLOBALS;

/** Byte 11: the screen brightness in percent (read only: the unit takes no write of it). */
const BRIGHTNESS_AT = 11;

export type MbGlobals = { readonly [K in MbGlobalSetting]: number } & {
  /** Screen brightness, percent (read only; changed on the unit in mb-32). */
  readonly brightness: number;
};

export interface MbEqBand {
  readonly on: boolean;
  readonly frequency: number;
  readonly q: number;
  readonly gain: number;
}

export interface MbGlobalEq {
  /** 0..100. */
  readonly level: number;
  /** Words 0..2: switch, frequency (19 = off), Q; no gain. */
  readonly lowCut: MbEqBand;
  /** Words 3..6. */
  readonly lowShelf: MbEqBand;
  /** Bands 1..4 (words 7..22). */
  readonly bands: readonly MbEqBand[];
  /** Words 23..26. */
  readonly highShelf: MbEqBand;
  /** Words 27..29: switch, frequency (20001 = off), Q; no gain. */
  readonly highCut: MbEqBand;
}

export interface MbGlobalState {
  readonly general: MbGlobals;
  readonly eq: MbGlobalEq;
  readonly eqOn: boolean;
}

/** Words: low cut 0..2, then groups of switch, frequency, Q, gain: low shelf, bands 1..4, high shelf; high cut 27..29. */
const FIRST_GROUP = 3;
const GROUP = 4;
const FREQUENCY = 1;
const Q = 2;
const GAIN = 3;
const LOW_CUT_FREQUENCY_WORD = 1;
const HIGH_CUT = 27;
const LEVEL_WORD = 30;
const HIGH_CUT_FREQUENCY_WORD = HIGH_CUT + FREQUENCY;
const BAND_HZ = [20, 20000] as const;
const Q_RANGE = [0.1, 10] as const;
const LOW_CUT_HZ = [20, 1000] as const;
const HIGH_CUT_HZ = [1000, 20000] as const;
/** The frequencies that mean a cut is off. */
export const MB_LOW_CUT_OFF_HZ = 19;
export const MB_HIGH_CUT_OFF_HZ = 20001;
export const MB_EQ_BANDS = 4;
const GAIN_DB = 20;
const PERCENT = 100;
const EQ_SWITCH = [0x01, 0x00, 0x00, 0x16] as const;

const fail = (msg: string): never => {
  throw new RangeError(`Matribox global: ${msg}`);
};
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;

/** The general table read. */
export const mbReadGlobals = (): Uint8Array => mbRequest(0, GENERAL_CMD);
/** The global EQ table read. */
export const mbReadGlobalEq = (): Uint8Array => mbRequest(0, EQ_CMD);
/** The global EQ switch read. */
export const mbReadGlobalEqOn = (): Uint8Array => mbRequest(1, EQ_CMD, EQ_SWITCH);

/** One global setting: `<index> <id> 00 00` + i32 (captures mb-30, mb-31, mb-33 … mb-36). */
export function mbSetGlobal(setting: MbGlobalSetting, value: number): Uint8Array {
  const { id, index, min, max } = MB_GLOBALS[setting];
  if (!Number.isInteger(value) || !inRange(value, min, max)) fail(`${setting} must be an integer ${min}..${max}, got ${value}`);
  return buildMbFrame(MB_WRITE, wrapMbMessage(1, GENERAL_CMD, [index, id, 0x00, 0x00, ...le32(value)]));
}

const eqWrite = (word: number, value: number) => buildMbFrame(MB_WRITE, wrapMbMessage(2, EQ_CMD, [...le32(word), ...float32LE(value)]));

/** The gain of EQ band `band` (0..3 = bands 1..4, words 10, 14, 18, 22), -20..+20 dB (capture mb-38: band 2, +3 dB). */
export function mbSetGlobalEqGain(band: number, gain: number): Uint8Array {
  if (!Number.isInteger(band) || !inRange(band, 0, MB_EQ_BANDS - 1)) fail(`EQ band must be 0..${MB_EQ_BANDS - 1}, got ${band}`);
  if (!inRange(gain, -GAIN_DB, GAIN_DB)) fail(`EQ gain must be -${GAIN_DB}..${GAIN_DB} dB, got ${gain}`);
  return eqWrite(FIRST_GROUP + (band + 1) * GROUP + GAIN, gain);
}

const bandWord = (band: number, offset: number) => {
  if (!Number.isInteger(band) || !inRange(band, 0, MB_EQ_BANDS - 1)) fail(`EQ band must be 0..${MB_EQ_BANDS - 1}, got ${band}`);
  return FIRST_GROUP + (band + 1) * GROUP + offset;
};

/**
 * The centre frequency of EQ band `band` (0..3, words 8, 12, 16, 20), 20..20000 Hz, or of the cut filters:
 * 'lowCut' (word 1, 20..1000 Hz, 19 = off) and 'highCut' (word 28, 1000..20000 Hz, 20001 = off).
 * NOT captured from the official editor (unlike the gain and level writes): it follows the documented
 * word layout and must be checked on the owner's unit.
 */
export function mbSetGlobalEqFrequency(target: number | 'lowCut' | 'highCut', hz: number): Uint8Array {
  if (target === 'lowCut') {
    if (hz !== MB_LOW_CUT_OFF_HZ && !inRange(hz, ...LOW_CUT_HZ)) fail(`low cut must be ${LOW_CUT_HZ[0]}..${LOW_CUT_HZ[1]} Hz or ${MB_LOW_CUT_OFF_HZ} (off), got ${hz}`);
    return eqWrite(LOW_CUT_FREQUENCY_WORD, hz);
  }
  if (target === 'highCut') {
    if (hz !== MB_HIGH_CUT_OFF_HZ && !inRange(hz, ...HIGH_CUT_HZ)) fail(`high cut must be ${HIGH_CUT_HZ[0]}..${HIGH_CUT_HZ[1]} Hz or ${MB_HIGH_CUT_OFF_HZ} (off), got ${hz}`);
    return eqWrite(HIGH_CUT_FREQUENCY_WORD, hz);
  }
  const word = bandWord(target, FREQUENCY);
  if (!inRange(hz, ...BAND_HZ)) fail(`EQ frequency must be ${BAND_HZ[0]}..${BAND_HZ[1]} Hz, got ${hz}`);
  return eqWrite(word, hz);
}

/** The Q of EQ band `band` (0..3, words 9, 13, 17, 21), 0.1..10. NOT captured from the official editor: it follows the documented layout, to be checked on the unit. */
export function mbSetGlobalEqQ(band: number, q: number): Uint8Array {
  const word = bandWord(band, Q);
  if (!inRange(q, ...Q_RANGE)) fail(`EQ Q must be ${Q_RANGE[0]}..${Q_RANGE[1]}, got ${q}`);
  return eqWrite(word, q);
}

/** The global EQ's level, 0..100 (capture mb-39). */
export function mbSetGlobalEqLevel(level: number): Uint8Array {
  if (!inRange(level, 0, PERCENT)) fail(`EQ level must be 0..${PERCENT}, got ${level}`);
  return eqWrite(LEVEL_WORD, level);
}

/** The global EQ's switch (capture mb-39): answered with `00 00 00 00` + u32, not echoed (mbWriteGlobalEqOn). */
export const mbSetGlobalEqOn = (on: boolean): Uint8Array => buildMbFrame(MB_WRITE, wrapMbMessage(1, EQ_CMD, [...EQ_SWITCH, ...le32(on ? 1 : 0)]));

const isEqOnAnswer = (data: Uint8Array) => data.length === 8 && data[0] === 0 && data[1] === 0 && data[2] === 0 && data[3] === 0;

/** The unit's answer to the EQ switch read or write: `00 00 00 00` + u32. */
export function parseMbGlobalEqOn(data: Uint8Array): boolean {
  if (!isEqOnAnswer(data)) throw new Error('not the global EQ switch answer (00 00 00 00 + u32)');
  return new DataView(data.buffer, data.byteOffset, 8).getUint32(4, true) !== 0;
}

/** The general table (52 bytes). */
export function parseMbGlobals(data: Uint8Array): MbGlobals {
  if (data.length !== MB_GENERAL_SIZE) throw new Error(`the global settings table must be ${MB_GENERAL_SIZE} bytes, got ${data.length}`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const value = ({ at, wide, min }: MbGlobalDef) => {
    if (wide) return min < 0 ? view.getInt16(at, true) : view.getUint16(at, true);
    return min < 0 ? view.getInt8(at) : view.getUint8(at);
  };
  const settings = Object.fromEntries(Object.entries(MB_GLOBALS).map(([name, d]) => [name, value(d)])) as { [K in MbGlobalSetting]: number };
  return { ...settings, brightness: data[BRIGHTNESS_AT] as number };
}

/** The global EQ table (124 bytes). */
export function parseMbGlobalEq(data: Uint8Array): MbGlobalEq {
  if (data.length !== MB_EQ_SIZE) throw new Error(`the global EQ table must be ${MB_EQ_SIZE} bytes, got ${data.length}`);
  const word = (i: number) => readFloat32LE(data, i * 4);
  const band = (at: number, gain: boolean): MbEqBand => ({ on: word(at) !== 0, frequency: word(at + 1), q: word(at + 2), gain: gain ? word(at + GAIN) : 0 });
  const group = (g: number) => band(FIRST_GROUP + g * GROUP, true);
  return {
    level: word(LEVEL_WORD),
    lowCut: band(0, false),
    lowShelf: group(0),
    bands: Array.from({ length: MB_EQ_BANDS }, (_, i) => group(i + 1)),
    highShelf: group(MB_EQ_BANDS + 1),
    highCut: band(HIGH_CUT, false),
  };
}

/** The three global reads, as the official editor sends them on connect. */
export async function mbReadGlobalState(link: MatriboxLink): Promise<MbGlobalState> {
  const general = parseMbGlobals(await link.ask(mbReadGlobals(), (d) => d.length === MB_GENERAL_SIZE));
  const eq = parseMbGlobalEq(await link.ask(mbReadGlobalEq(), (d) => d.length === MB_EQ_SIZE));
  const eqOn = parseMbGlobalEqOn(await link.ask(mbReadGlobalEqOn(), isEqOnAnswer));
  return { general, eq, eqOn };
}

/**
 * Switches the global EQ and checks the unit's answer holds the new state. The unit answers nothing
 * when the switch is already in that state, so it is read first and left alone then.
 */
export async function mbWriteGlobalEqOn(link: MatriboxLink, on: boolean): Promise<void> {
  if (parseMbGlobalEqOn(await link.ask(mbReadGlobalEqOn(), isEqOnAnswer)) === on) return;
  if (parseMbGlobalEqOn(await link.ask(mbSetGlobalEqOn(on), isEqOnAnswer)) !== on) throw new Error(`the Matribox did not switch the global EQ ${on ? 'on' : 'off'}`);
}
