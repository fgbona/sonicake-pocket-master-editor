/**
 * Matribox II Pro write frames (live edits of the loaded preset, preset select, save), rebuilt from
 * the official editor's traffic (docs/matribox.md, "Writes"). Every write is a flag-1 message,
 * cmd 0x10 except save (0x05), in a type-0x12 frame. The unit echoes set param, on/off and select;
 * it answers a chain edit (add, move, remove, change model) with its chain notice, and a save with
 * nothing (check it by reading the slot back).
 *
 * Every builder is byte-exact with a captured host frame. Hardware-validated on the owner's unit
 * (2026-11-24): every builder here but the whole preset and the live controls at the end (patch
 * volume, CTRL and expression assignments: captures mb-01, mb-09, mb-04, checked on the unit since).
 * The footswitch-function and quick-knob writes come from waveod's reimplemented firmware
 * (github.com/zxmarcos/waveod, MIT, (c) 2026 Marcos Medeiros), not from a capture.
 */
import { buildMbFrame, buildMbFrames, float32LE, MB_WRITE } from './frame.ts';
import { wrapMbMessage } from './message.ts';
import { MB_PRESET_COUNT, mbPresetBody, type MbPreset } from './preset.ts';

export const MB_SLOTS = 12;
/** Values per slot in sec5: parameter ids are 0..14. */
const PARAMS_PER_SLOT = 15;
const MODULES = 16;
const NO_SLOT = 0xff;
const NAME_FIELD = 17;
const SET_CMD = 0x10;
const SAVE_CMD = 0x05;
/** The official editor's whole-preset write is the only flag-2 message seen. */
const WHOLE_PRESET_FLAG = 2;

const fail = (msg: string): never => {
  throw new RangeError(`Matribox write: ${msg}`);
};
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const write = (cmd: number, data: readonly number[]) => buildMbFrame(MB_WRITE, wrapMbMessage(1, cmd, data));
const isIn = (n: number, size: number) => Number.isInteger(n) && n >= 0 && n < size;

function checkSlot(slot: number): number {
  return isIn(slot, MB_SLOTS) ? slot : fail(`slot must be 0..${MB_SLOTS - 1}, got ${slot}`);
}

function checkPreset(index: number): number {
  return isIn(index, MB_PRESET_COUNT) ? index : fail(`preset index must be 0..${MB_PRESET_COUNT - 1}, got ${index}`);
}

/** A model's parameters, as the catalog lists them (by widget ID): enough to address one on the wire. */
export interface MbParamList {
  readonly params: readonly { readonly id: number }[];
}

/**
 * The frames mbSetParam built, with the widget ID the unit's echo names (the frame carries the
 * order): the link checks the echo with it. In process only, like the frames themselves.
 */
const echoIds = new WeakMap<Uint8Array, number>();
/** The widget ID the echo of a set-param frame from mbSetParam names; undefined for any other frame. */
export const mbParamEchoId = (frame: Uint8Array): number | undefined => echoIds.get(frame);

/**
 * One parameter of a storage slot (not a chain position) in the loaded preset: `01 00 05 01` + slot +
 * u32 order + f32. The unit takes the parameter's ORDER in the model's list, not its widget ID, and
 * echoes the widget ID (stock FUN_000213CC / FUN_0002048C, reimplemented in zxmarcos/waveod and
 * zxmarcos/matribox-studio, MIT): they differ where a model's IDs skip, every CAB and IR (1, 5, 6),
 * the Peavey 5150 and a few more. Capture mb-46 (2026-11-26): widget ID 5 (a CAB's Low Cut) sent as
 * is, the unit took it for order 5, past the CAB's three, and echoed ID 0. `model` is the slot's
 * model; null when the catalog does not know it (its IDs are taken for the order).
 */
export function mbSetParam(slot: number, model: MbParamList | null, paramId: number, value: number): Uint8Array {
  checkSlot(slot);
  if (!isIn(paramId, PARAMS_PER_SLOT)) fail(`parameter id must be 0..${PARAMS_PER_SLOT - 1}, got ${paramId}`);
  if (!Number.isFinite(value)) fail(`value must be a finite number, got ${value}`);
  const order = model ? model.params.findIndex((p) => p.id === paramId) : paramId;
  if (order < 0) fail(`the model has no parameter id ${paramId} (its ids: ${model?.params.map((p) => p.id).join(', ') || 'none'})`);
  const frame = write(SET_CMD, [0x01, 0x00, 0x05, 0x01, ...u32(slot), ...u32(order), ...float32LE(value)]);
  echoIds.set(frame, paramId);
  return frame;
}

/** Turns a storage slot's block on or off: `02 00 05 01` + slot + state. */
export function mbSetBlockOn(slot: number, on: boolean): Uint8Array {
  return write(SET_CMD, [0x02, 0x00, 0x05, 0x01, ...u32(checkSlot(slot)), ...u32(on ? 1 : 0)]);
}

/** Loads preset `index` (0..239; label 1A = 0 … 60D = 239). Unsaved edits are lost. */
export function mbSelectPreset(index: number): Uint8Array {
  return write(SET_CMD, [0x01, 0x00, 0x0a, 0x01, ...u32(checkPreset(index))]);
}

/** A chain edit: `01 00 04 01` + from + to + module + fxid. NONE as `from` adds, NONE as `to` removes. */
function chainEdit(from: number, to: number, moduleIndex: number, fxid: number): Uint8Array {
  return write(SET_CMD, [0x01, 0x00, 0x04, 0x01, from, to, moduleIndex, ...u32(fxid)]);
}

function checkPosition(position: number): number {
  return isIn(position, MB_SLOTS) ? position : fail(`chain position must be 0..${MB_SLOTS - 1}, got ${position}`);
}

function checkModel(moduleIndex: number, fxid: number): void {
  if (!isIn(moduleIndex, MODULES)) fail(`module index must be 0..${MODULES - 1}, got ${moduleIndex}`);
  if (!Number.isInteger(fxid) || fxid < 0 || fxid > 0xffffffff) fail(`fxid must be a u32, got ${fxid}`);
}

/** Inserts a block of `moduleIndex`/`fxid` at 0-based chain `position`; the unit picks the slot and loads the model's defaults. */
export function mbAddBlock(position: number, moduleIndex: number, fxid: number): Uint8Array {
  checkModel(moduleIndex, fxid);
  return chainEdit(NO_SLOT, checkPosition(position), moduleIndex, fxid);
}

/** Moves the block at chain position `from` to position `to`. */
export function mbMoveBlock(from: number, to: number): Uint8Array {
  return chainEdit(checkPosition(from), checkPosition(to), NO_SLOT, 0xffffffff);
}

/** Removes the block at chain `position`. */
export function mbRemoveBlock(position: number): Uint8Array {
  return chainEdit(checkPosition(position), NO_SLOT, 0, 0);
}

/**
 * Swaps the model of the block in storage `slot` (`02 00 04 01` + slot + module + fxid), like set
 * param and on/off; the unit loads the new model's defaults. Slot, not chain position: checked on
 * the owner's unit with a block whose slot and position differ.
 */
export function mbChangeModel(slot: number, moduleIndex: number, fxid: number): Uint8Array {
  checkModel(moduleIndex, fxid);
  return write(SET_CMD, [0x02, 0x00, 0x04, 0x01, checkSlot(slot), moduleIndex, ...u32(fxid)]);
}

/** Printable ASCII, 1..16 characters: the unit's 17-byte, NUL-terminated name field. */
export function checkMbPresetName(name: string): string {
  return /^[\x20-\x7e]{1,16}$/.test(name) && name.trim() !== '' ? name : fail(`preset name must be 1..16 printable ASCII characters, got "${name}"`);
}

/**
 * cmd 0x05: u32 index + 17-byte name. Seen once storing the loaded preset as 60D "TESTE OSX" (capture
 * 2), and once in capture 1 with the next preset's own name before a select. UNVERIFIED as "save the
 * loaded preset to `index`": gate it behind a confirmation and back up the target first.
 */
export function mbSavePreset(index: number, name: string): Uint8Array {
  const chars = Array.from(checkMbPresetName(name), (c) => c.charCodeAt(0));
  return write(SAVE_CMD, [...u32(checkPreset(index)), ...chars, ...Array<number>(NAME_FIELD - chars.length).fill(0)]);
}

/**
 * The whole preset in one message, as the official editor sends a .prst it imports (capture mb-20,
 * not yet sent by us to the unit): flag 2, cmd 0x10, u32 `index` + the 1207-byte body with the
 * .prst section tags, paged (183 bytes per frame). The unit answers flag 0, cmd 0x17, `02 00 00 10`.
 * The editor selected `index` first and then re-read it, which showed the new preset: whether the
 * write also stores the slot is not known, so store it with mbSavePreset.
 */
export function mbWritePreset(index: number, preset: MbPreset): Uint8Array[] {
  const data = [...u32(checkPreset(index)), ...mbPresetBody(preset)];
  return buildMbFrames(MB_WRITE, wrapMbMessage(WHOLE_PRESET_FLAG, SET_CMD, data));
}

/** Footswitches A..D (A = 0) of the stomp-mode function table (section 3). */
export const MB_FOOTSWITCHES = 4;
/** CTRL 1..4 (0..3): groups of slots a footswitch function switches (section 8 rows; a fifth row, the preset CTRL, is not offered). */
export const MB_CTRLS = 4;
/** Quick knobs 1..3 (0..2). */
export const MB_QUICK_KNOBS = 3;
/** Quick-knob targets after the 12 slots (waveod, fw/preset_format.h). */
export const MB_QK_BPM = 12;
export const MB_QK_VOLUME = 13;
/**
 * The footswitch functions the official editor offers, in its order (waveod, model/assign.c; values
 * from fw/preset_format.h `enum fs_function`). The firmware also knows 24..35, "toggle slot 1..12",
 * which the editor does not offer: read, never written.
 */
export const MB_FS_FUNCTIONS: readonly { readonly id: number; readonly name: string }[] = [
  [0, 'none'],
  [1, 'CTRL 1'],
  [2, 'CTRL 2'],
  [3, 'CTRL 3'],
  [4, 'CTRL 4'],
  [8, 'tap tempo'],
  [5, 'looper'],
  [6, 'drum machine'],
  [19, 'previous rhythm'],
  [18, 'next rhythm'],
  [7, 'tuner'],
  [20, 'EXP A/B'],
  [12, 'preset down'],
  [11, 'preset up'],
  [10, 'bank down'],
  [9, 'bank up'],
  [13, 'preset A'],
  [14, 'preset B'],
  [15, 'preset C'],
  [16, 'preset D'],
  [23, 'footswitch mode'],
].map(([id, name]) => Object.freeze({ id: id as number, name: name as string }));
/** The function "CTRL n" (n = 1..4). */
export const MB_FS_CTRL1 = 1;
const NONE_U32 = 0xffffffff;
/** Expression-pedal entries in section 7 (EXP 1 mode A 0..2, mode B 3..5, EXP 2 6..8: the unit addresses them as group and position). */
export const MB_EXP_ENTRIES = 9;
const PERCENT = 100;

function checkPercent(what: string, value: number): number {
  return Number.isFinite(value) && value >= 0 && value <= PERCENT ? value : fail(`${what} must be 0..${PERCENT}, got ${value}`);
}

function checkEntry(entry: number): number {
  return isIn(entry, MB_EXP_ENTRIES) ? entry : fail(`expression entry must be 0..${MB_EXP_ENTRIES - 1}, got ${entry}`);
}

/** The loaded preset's patch volume, 0..100 (capture mb-01: streamed while dragging, echoed): `03 00 05 01` + u32. */
export function mbSetPatchVolume(volume: number): Uint8Array {
  if (!Number.isInteger(volume)) fail(`patch volume must be an integer, got ${volume}`);
  return write(SET_CMD, [0x03, 0x00, 0x05, 0x01, ...u32(checkPercent('patch volume', volume))]);
}

/**
 * Puts storage `slot` in CTRL `ctrl` (0..3 = CTRL 1..4) or takes it out: `01 00 08 01` + u32 CTRL +
 * u32 slot + u32 1/0 (capture mb-09, the official editor's "footswitch A" box: FS A runs CTRL 1 by
 * default). A footswitch whose function is that CTRL toggles every slot in it.
 */
export function mbAssignCtrl(ctrl: number, slot: number, member: boolean): Uint8Array {
  if (!isIn(ctrl, MB_CTRLS)) fail(`CTRL must be 0..${MB_CTRLS - 1} (CTRL 1..4), got ${ctrl}`);
  return write(SET_CMD, [0x01, 0x00, 0x08, 0x01, ...u32(ctrl), ...u32(checkSlot(slot)), ...u32(member ? 1 : 0)]);
}

/**
 * What footswitch `footswitch` (A = 0 … D = 3) does in stomp mode when pressed (or held): `01 00 03 01`
 * (press) or `02 00 03 01` (hold) + u32 switch + u32 function (waveod, editor/preset_msgs.c sub_fs; not
 * captured from the official editor). `fn` is an id of MB_FS_FUNCTIONS.
 */
export function mbSetFootswitchFunction(footswitch: number, fn: number, hold = false): Uint8Array {
  if (!isIn(footswitch, MB_FOOTSWITCHES)) fail(`footswitch must be 0..${MB_FOOTSWITCHES - 1} (A..D), got ${footswitch}`);
  if (!MB_FS_FUNCTIONS.some((f) => f.id === fn)) fail(`footswitch function ${fn} is not one the editor offers`);
  return write(SET_CMD, [hold ? 0x02 : 0x01, 0x00, 0x03, 0x01, ...u32(footswitch), ...u32(fn)]);
}

/**
 * Points quick knob `knob` (0..2) at `target` (a storage slot 0..11, MB_QK_BPM, MB_QK_VOLUME or null
 * for none) and its parameter (catalog widget ID; 0 for BPM, volume and none): `01 00 02 01` + u32
 * knob + u32 target (-1 = none), then `02 00 02 01` + u32 knob + u32 parameter (waveod,
 * editor/preset_msgs.c sub_quick; not captured from the official editor).
 */
export function mbAssignQuickKnob(knob: number, target: number | null, paramId: number): Uint8Array[] {
  if (!isIn(knob, MB_QUICK_KNOBS)) fail(`quick knob must be 0..${MB_QUICK_KNOBS - 1}, got ${knob}`);
  if (target !== null && !isIn(target, MB_QK_VOLUME + 1)) fail(`quick knob target must be a slot 0..${MB_SLOTS - 1}, BPM (${MB_QK_BPM}) or volume (${MB_QK_VOLUME}), got ${target}`);
  if (!isIn(paramId, PARAMS_PER_SLOT)) fail(`parameter id must be 0..${PARAMS_PER_SLOT - 1}, got ${paramId}`);
  return [write(SET_CMD, [0x01, 0x00, 0x02, 0x01, ...u32(knob), ...u32(target ?? NONE_U32)]), write(SET_CMD, [0x02, 0x00, 0x02, 0x01, ...u32(knob), ...u32(paramId)])];
}

export interface MbExpressionAssignment {
  /** Section 7 entry 0..8. */
  readonly entry: number;
  /** Storage slot of the block the pedal moves. */
  readonly slot: number;
  /** Catalog widget ID of the parameter. */
  readonly paramId: number;
  /** Heel and toe ends, 0..100 (the official editor's slider values). */
  readonly min: number;
  readonly max: number;
}

/** Entry 0..8 as the unit addresses it: group (0 = EXP 1 mode A, 1 = mode B, 2 = EXP 2) and position 0..2. */
const expressionRef = (entry: number) => [...u32(Math.floor(checkEntry(entry) / 3)), ...u32(entry % 3)];

/**
 * Points expression-pedal entry `entry` at a block's parameter: `02 00 07 01` + u32 group + u32
 * position + u32 slot + u32 param + f32 min + f32 max. Capture mb-04 had every field at 0; the order
 * was settled on the owner's unit (2026-11-24): (1,0,1,0) landed in entry 4 on slot 1, (0,0,1,1)
 * in entry 1 on slot 1 parameter 1. Section 7 lists the entries in that order (entry = group*3+position).
 */
export function mbAssignExpression({ entry, slot, paramId, min, max }: MbExpressionAssignment): Uint8Array {
  if (!isIn(paramId, PARAMS_PER_SLOT)) fail(`parameter id must be 0..${PARAMS_PER_SLOT - 1}, got ${paramId}`);
  const ends = [...float32LE(checkPercent('expression min', min)), ...float32LE(checkPercent('expression max', max))];
  return write(SET_CMD, [0x02, 0x00, 0x07, 0x01, ...expressionRef(entry), ...u32(checkSlot(slot)), ...u32(paramId), ...ends]);
}

/**
 * Clears expression entry `entry` (the editor's "unused"): the assignment with slot -1, as the quick
 * knob takes "none" and section 7 stores FF (not captured from the official editor).
 */
export function mbClearExpression(entry: number): Uint8Array {
  return write(SET_CMD, [0x02, 0x00, 0x07, 0x01, ...expressionRef(entry), ...u32(NONE_U32), ...u32(0), ...float32LE(0), ...float32LE(100)]);
}

/**
 * One end of an expression entry: `03 00 07 01` (min) or `04 00 07 01` (max) + u32 group + u32
 * position + f32 (the capture had both u32 at 0; the same addressing as the assignment, unconfirmed).
 */
function expressionEnd(op: number, what: string, entry: number, value: number): Uint8Array {
  return write(SET_CMD, [op, 0x00, 0x07, 0x01, ...expressionRef(entry), ...float32LE(checkPercent(what, value))]);
}

/**
 * The writes that point entry `a.entry` at a parameter with the range `a.min`..`a.max`, as the
 * official editor sends them: the unit ignores the range in an assignment (it echoes 0..100), so
 * the assignment goes with the full range and the ends that differ follow as min/max writes.
 */
export function mbExpressionWrites(a: MbExpressionAssignment): Uint8Array[] {
  if (a.min > a.max) fail(`expression min (${a.min}) must not be above max (${a.max})`);
  return [mbAssignExpression({ ...a, min: 0, max: 100 }), ...(a.min !== 0 ? [mbSetExpressionMin(a.entry, a.min)] : []), ...(a.max !== 100 ? [mbSetExpressionMax(a.entry, a.max)] : [])];
}

export const mbSetExpressionMin = (entry: number, value: number): Uint8Array => expressionEnd(0x03, 'expression min', entry, value);
export const mbSetExpressionMax = (entry: number, value: number): Uint8Array => expressionEnd(0x04, 'expression max', entry, value);
