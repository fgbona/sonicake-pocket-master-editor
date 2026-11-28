'use client';

import { useMemo, useRef } from 'react';
import { mbPresetLabel, presetLabel, type MbPreset } from '@pocket-master/core';
import type { Matribox } from '../useMatribox.ts';
import type { usePocketMaster } from '../usePocketMaster.ts';
import { type DeviceView, mbDirtySlots, mbParamDirty, pocketDirtyModules, pocketParamDirty, syncState } from './device.ts';

type PocketMaster = ReturnType<typeof usePocketMaster>;

/** The Pocket Master's state as the workstation's DeviceView; dirty blocks by module number. */
export function usePocketDevice(pm: PocketMaster): DeviceView {
  const linked = pm.status === 'connected' || pm.status === 'reading';
  const busy = pm.busy?.step ?? (pm.status === 'reading' ? 'Reading' : null);
  const dirtyBlocks = useMemo(() => pocketDirtyModules(pm.preset, pm.restorePoint), [pm.preset, pm.restorePoint]);
  const sync = syncState({ linked, busy, dirty: pm.modified });
  const slot = pm.presetIndex === null ? '' : presetLabel(pm.presetIndex);
  const { preset, restorePoint } = pm;
  // One object while nothing changes: the memoised chain view takes it.
  return useMemo(
    () => ({ sync, slot, dirtyBlocks, paramDirty: (module: number, alg: number, value: number) => pocketParamDirty(preset, restorePoint, module, alg, value) }),
    [sync, slot, dirtyBlocks, preset, restorePoint],
  );
}

/**
 * The Matribox's state as the workstation's DeviceView; dirty blocks by storage slot. The unit only
 * says "edited or not", so the preset it last reported unedited is kept as the baseline.
 */
export function useMatriboxDevice(mb: Matribox): DeviceView {
  const baseline = useRef<MbPreset | null>(null);
  const preset = mb.unit?.preset ?? null;
  if (!preset) baseline.current = null;
  else if (!mb.edited || baseline.current === null) baseline.current = preset;
  const stored = baseline.current;
  const dirtyBlocks = useMemo(() => (mb.edited ? mbDirtySlots(preset, stored) : new Set<number>()), [mb.edited, preset, stored]);
  const sync = syncState({ linked: mb.unit !== null, busy: mb.busy, dirty: mb.edited });
  const slot = mb.unit ? mbPresetLabel(mb.unit.current) : '';
  const edited = mb.edited;
  return useMemo(
    () => ({ sync, slot, dirtyBlocks, paramDirty: (block: number, id: number, value: number) => edited && mbParamDirty(preset, stored, block, id, value) }),
    [sync, slot, dirtyBlocks, edited, preset, stored],
  );
}
