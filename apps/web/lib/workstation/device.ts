/**
 * The workstation's read-only view of a connected pedal, the same for both pedals. The protocol
 * hooks (usePocketMaster, useMatribox) keep every write; this adapter only turns their state into
 * what the shared UI shows: the sync state and which blocks differ from the stored preset.
 */
import type { MbPreset, Preset } from '@pocket-master/core';

/**
 * offline: no unit. reading: the editor is reading the unit. writing: a write is in flight.
 * synced: the edit buffer matches the stored slot. dirty: edits not stored in the slot yet.
 */
export type SyncState = 'offline' | 'reading' | 'writing' | 'synced' | 'dirty';

export interface DeviceView {
  readonly sync: SyncState;
  /** The loaded slot as the unit names it ("P07", "17C"); '' when none. */
  readonly slot: string;
  /** Ids of the blocks whose stored values the edit buffer no longer matches (DeviceBlockId). */
  readonly dirtyBlocks: ReadonlySet<number>;
  /** Whether a block's parameter (Pocket Master: module and alg; Matribox: slot and widget id) differs from the stored value. */
  readonly paramDirty: (block: number, param: number, value: number) => boolean;
}

/** Busy steps that read the unit (both hooks name their steps in English). */
const READ_STEPS = new Set(['Reading', 'Loading', 'Preparing']);

export function syncState(input: { readonly linked: boolean; readonly busy: string | null; readonly dirty: boolean }): SyncState {
  if (!input.linked) return 'offline';
  if (input.busy !== null) return READ_STEPS.has(input.busy) ? 'reading' : 'writing';
  return input.dirty ? 'dirty' : 'synced';
}

const sameNumbers = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** Pocket Master: the modules whose model, on/off or a parameter differ from the restore point (the preset as read or saved). */
export function pocketDirtyModules(preset: Preset | null, stored: Preset | null): ReadonlySet<number> {
  if (!preset || !stored) return new Set();
  const before = new Map(stored.chain.map((b) => [b.module, b]));
  return new Set(
    preset.chain
      .filter((b) => {
        const s = before.get(b.module);
        return (
          !s ||
          s.on !== b.on ||
          s.code !== b.code ||
          !sameNumbers(
            b.params.map((p) => p.value),
            s.params.map((p) => p.value),
          )
        );
      })
      .map((b) => b.module),
  );
}

/**
 * Matribox: the storage slots whose model, on/off or values differ from the baseline (the preset as
 * the unit last reported it unedited). A slot only in the edit buffer (a block just added) is dirty.
 */
export function mbDirtySlots(preset: MbPreset | null, baseline: MbPreset | null): ReadonlySet<number> {
  if (!preset || !baseline) return new Set();
  const before = new Map(baseline.chain.map((b) => [b.slot, b]));
  return new Set(
    preset.chain
      .filter((b) => {
        const s = before.get(b.slot);
        return !s || s.on !== b.on || s.fxid !== b.fxid || s.moduleIndex !== b.moduleIndex || !sameNumbers(b.values, s.values);
      })
      .map((b) => b.slot),
  );
}

/**
 * Pocket Master: whether a parameter differs from the restore point. A block whose model changed
 * has every parameter edited (the stored values belong to another model).
 */
export function pocketParamDirty(preset: Preset | null, stored: Preset | null, module: number, alg: number, value: number): boolean {
  if (!preset || !stored) return false;
  const before = stored.chain.find((b) => b.module === module);
  const now = preset.chain.find((b) => b.module === module);
  if (!before || !now || before.code !== now.code) return true;
  const p = before.params.find((x) => x.alg === alg);
  return !p || !Object.is(p.value, value);
}

/** Matribox: whether a block's value (by widget id) differs from the baseline; a new block or another model is edited throughout. */
export function mbParamDirty(preset: MbPreset | null, baseline: MbPreset | null, slot: number, id: number, value: number): boolean {
  if (!preset || !baseline) return false;
  const before = baseline.chain.find((b) => b.slot === slot);
  const now = preset.chain.find((b) => b.slot === slot);
  if (!before || !now || before.fxid !== now.fxid || before.moduleIndex !== now.moduleIndex) return true;
  return !Object.is(before.values[id], value);
}
