'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  matriboxLink,
  MB_CATALOG,
  mbAssignments,
  mbAddBlock,
  mbClearExpression,
  mbExpressionWrites,
  mbAssignCtrl,
  mbAssignQuickKnob,
  mbSetFootswitchFunction,
  mbBackupAllPresets,
  mbChangeModel,
  mbMoveBlock,
  mbReadEditBuffer,
  mbRemoveBlock,
  mbRestoreAllPresets,
  mbSelectPreset,
  mbSetBlockOn,
  mbSetParam,
  mbSetGlobal,
  mbSetGlobalEqFrequency,
  mbSetGlobalEqGain,
  mbSetGlobalEqQ,
  mbSetGlobalEqLevel,
  mbSetPatchVolume,
  mbUploadClone,
  mbWriteGlobalEqOn,
  mbDrumWith,
  mbReadDrumState,
  mbWriteDrum,
  mbWriteIrName,
  parseMbPreset,
  withMbVolume,
  type MatriboxLink,
  type MbBackupAll,
  type MbCloneStep,
  type MbDrumChange,
  type MbDrumState,
  type MbExpressionAssignment,
  type MbGlobalSetting,
  type MbGlobalState,
  type MbPreset,
  type MbProgress,
  type MidiPort,
  type Progress,
} from '@pocket-master/core';
import { readLoaded, readUnit, saveToSlot, serialQueue, withBlockOn, withNotice, withParam, type MbBackup, type MbUnit } from './matribox';
import { applyChain, MbApplyError } from './matriboxOps';
import { modelOf, type MbChainBlock } from './matriboxPlan';
import { keepMbBackup, loadMbBackups, storeMbBackups } from './matriboxBackups';
import { importToSlot } from './matriboxPresetFile';
import { readGlobals, TEMPO_NOT_ACCEPTED, withEqFrequency, withEqGain, withEqLevel, withEqOn, withEqQ, withGlobal } from './matriboxGlobals';

export interface MatriboxState {
  readonly unit: MbUnit | null;
  /** What runs now ("Saving", …); edits wait meanwhile. */
  readonly busy: string | null;
  readonly error: string | null;
  /** Live edits since the preset was loaded or saved: loading another one asks first. */
  readonly edited: boolean;
  readonly backups: readonly MbBackup[];
  /** Set when the browser would not keep a backup: it must be downloaded. */
  readonly storageWarning: boolean;
  /** Backup all / restore all: how far it got ("Backing up 12A", "Restoring 12A"). */
  readonly progress: Progress | null;
  /** The global settings (Global options); null until read, or when the unit did not answer them. */
  readonly globals: MbGlobalState | null;
  /** The unit's last "System overloaded" notice (cpu: every block switched off; memory: a block refused), until closed. */
  readonly overload: 'cpu' | 'memory' | null;
  /** The drum machine; null until read, or when the unit did not answer. */
  readonly drum: MbDrumState | null;
}

const INITIAL: MatriboxState = { unit: null, busy: null, error: null, edited: false, backups: [], storageWarning: false, progress: null, globals: null, overload: null, drum: null };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The drum machine's state; null (logged) when the unit does not answer, so the editor still opens. */
async function readDrum(link: MatriboxLink): Promise<MbDrumState | null> {
  try {
    return await mbReadDrumState(link);
  } catch (e) {
    console.error('Matribox: could not read the drum machine', e);
    return null;
  }
}

/** The Matribox II Pro editor's state and actions over its open MIDI ports. */
export function useMatribox(port: MidiPort | null) {
  const [state, setState] = useState<MatriboxState>(INITIAL);
  /** The state as last rendered, for writes queued earlier (a knob's model when its value goes out). */
  const stateRef = useRef(state);
  stateRef.current = state;
  const patch = useCallback((p: Partial<MatriboxState>) => setState((s) => ({ ...s, ...p })), []);
  const link = useMemo<MatriboxLink | null>(() => (port ? matriboxLink(port) : null), [port]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: link is the trigger (every link gets its own queue)
  const queue = useMemo(serialQueue, [link]);
  /** Latest value per parameter not sent yet: a knob drag sends only the newest value. */
  const pending = useRef(new Map<string, { slot: number; id: number; value: number }>());
  const backupsRef = useRef<readonly MbBackup[]>([]);

  /** Runs a step on the unit, one at a time; false when it failed (the error is shown). */
  const run = useCallback(
    (busy: string | null, step: (unit: MatriboxLink) => Promise<void>): Promise<boolean> => {
      if (!link) return Promise.resolve(false);
      return queue(async () => {
        if (busy) patch({ busy, error: null });
        try {
          await step(link);
          return true;
        } catch (e) {
          console.error(`Matribox: ${busy ?? 'edit'} failed`, e);
          patch({ error: message(e) });
          return false;
        } finally {
          if (busy) patch({ busy: null });
        }
      });
    },
    [link, queue, patch],
  );

  const reloadLoaded = useCallback(async (unit: MatriboxLink): Promise<MbPreset> => {
    const loaded = await readLoaded(unit);
    setState((s) => ({ ...s, unit: s.unit ? { ...s.unit, ...loaded } : s.unit }));
    return loaded.preset;
  }, []);

  const refresh = useCallback(
    () =>
      run('Reading', async (unit) => {
        const read = await readUnit(unit);
        patch({ unit: read, edited: false, globals: await readGlobals(unit), drum: await readDrum(unit) });
      }),
    [run, patch],
  );

  /** The global settings as the editor or the unit changed them. */
  const patchGlobals = useCallback((update: (g: MbGlobalState) => MbGlobalState) => setState((s) => (s.globals ? { ...s, globals: update(s.globals) } : s)), []);

  /** A chain changed on the unit: read the loaded preset again, once per burst (the unit sends several while a knob turns). */
  const chainReread = useRef(false);

  // Follow what is done on the unit itself: another preset loaded (read again), blocks, knobs, volume.
  const currentRef = useRef<number | null>(null);
  const current = state.unit?.current ?? null;
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    if (!link) return;
    link.onNotice((notice) => {
      if (notice.kind === 'edited') return patch({ edited: notice.edited });
      if (notice.kind === 'global') return patchGlobals((g) => withGlobal(g, notice.setting, notice.value));
      if (notice.kind === 'drum') return patch({ drum: notice });
      if (notice.kind === 'drumChange') return setState((s) => (s.drum ? { ...s, drum: mbDrumWith(s.drum, notice.change) } : s));
      if (notice.kind === 'overload') return patch({ overload: notice.cause });
      if (notice.kind === 'saved') {
        const saved = { name: notice.name, style: '' };
        setState((s) => {
          if (!s.unit) return s;
          const names = s.unit.names.map((n, i) => (i === notice.index ? { ...saved, style: n.style } : n));
          const preset = notice.index === s.unit.current ? { ...s.unit.preset, name: notice.name } : s.unit.preset;
          return { ...s, edited: false, unit: { ...s.unit, names, preset } };
        });
        return;
      }
      if (notice.kind === 'chain') {
        if (chainReread.current) return;
        chainReread.current = true;
        void run('Loading', async (unit) => {
          chainReread.current = false;
          await reloadLoaded(unit);
          patch({ edited: true });
        });
        return;
      }
      if (notice.kind !== 'preset') {
        // A volume notice with the volume already shown changes nothing: no edit.
        const same = (s: MatriboxState) => notice.kind === 'volume' && s.unit !== null && mbAssignments(s.unit.preset).volume === notice.value;
        setState((s) => (!s.unit || same(s) ? s : { ...s, edited: true, unit: { ...s.unit, preset: withNotice(s.unit.preset, notice) } }));
        return;
      }
      if (notice.index === currentRef.current) return; // the unit sends it twice
      currentRef.current = notice.index;
      void run('Loading', async (unit) => {
        await reloadLoaded(unit);
        patch({ edited: false });
      });
    });
    return () => link.onNotice(null);
  }, [link, run, reloadLoaded, patch, patchGlobals]);

  useEffect(() => {
    if (link) void refresh();
    else setState((s) => ({ ...s, unit: null, busy: null, error: null }));
  }, [link, refresh]);

  useEffect(() => {
    backupsRef.current = loadMbBackups();
    patch({ backups: backupsRef.current });
    // The catalog is built in now: drop the alg_data.json older versions kept in this browser (its only use of IndexedDB).
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('pocket-master-editor');
  }, [patch]);

  const select = useCallback(
    (index: number) =>
      run('Loading', async (unit) => {
        await unit.write(mbSelectPreset(index));
        await reloadLoaded(unit);
        patch({ edited: false });
      }),
    [run, reloadLoaded, patch],
  );

  const setParam = useCallback(
    (slot: number, id: number, value: number) => {
      setState((s) => ({ ...s, edited: true, unit: s.unit ? { ...s.unit, preset: withParam(s.unit.preset, slot, id, value) } : s.unit }));
      const key = `${slot}:${id}`;
      const queued = pending.current.has(key);
      pending.current.set(key, { slot, id, value });
      if (queued) return;
      void run(null, async (unit) => {
        const latest = pending.current.get(key);
        pending.current.delete(key);
        if (!latest) return;
        const block = stateRef.current.unit?.preset.chain.find((b) => b.slot === latest.slot);
        await unit.write(mbSetParam(latest.slot, block ? modelOf(MB_CATALOG, block) : null, latest.id, latest.value));
      });
    },
    [run],
  );

  const setOn = useCallback(
    (slot: number, on: boolean) => {
      setState((s) => ({ ...s, edited: true, unit: s.unit ? { ...s.unit, preset: withBlockOn(s.unit.preset, slot, on) } : s.unit }));
      return run(null, (unit) => unit.write(mbSetBlockOn(slot, on)));
    },
    [run],
  );

  /** Latest patch volume not sent yet: a slider drag sends only the newest value. */
  const pendingVolume = useRef<number | null>(null);
  const setVolume = useCallback(
    (volume: number) => {
      setState((s) => ({ ...s, edited: true, unit: s.unit ? { ...s.unit, preset: withMbVolume(s.unit.preset, volume) } : s.unit }));
      const queued = pendingVolume.current !== null;
      pendingVolume.current = volume;
      if (queued) return;
      void run(null, async (unit) => {
        const latest = pendingVolume.current;
        pendingVolume.current = null;
        if (latest !== null) await unit.write(mbSetPatchVolume(latest));
      });
    },
    [run],
  );

  /**
   * Global writes, newest value only per setting (a slider drag sends the last value once the one
   * before is confirmed). Shown at once; when a write fails the globals are read again to show the unit's.
   */
  const pendingGlobals = useRef(new Map<string, (unit: MatriboxLink) => Promise<unknown>>());
  const sendGlobal = useCallback(
    (key: string, shown: (g: MbGlobalState) => MbGlobalState, send: (unit: MatriboxLink) => Promise<unknown>) => {
      patchGlobals(shown);
      const queued = pendingGlobals.current.has(key);
      pendingGlobals.current.set(key, send);
      if (queued) return;
      void run(null, async (unit) => {
        const latest = pendingGlobals.current.get(key);
        pendingGlobals.current.delete(key);
        try {
          if (latest) await latest(unit);
        } catch (e) {
          patch({ globals: await readGlobals(unit) });
          throw e;
        }
      });
    },
    [run, patch, patchGlobals],
  );
  const setGlobal = useCallback(
    (setting: MbGlobalSetting, value: number) =>
      sendGlobal(
        setting,
        (g) => withGlobal(g, setting, value),
        (unit) =>
          unit.write(mbSetGlobal(setting, value)).catch((e: unknown) => {
            throw setting === 'tempoOn' && value === 1 ? new Error(TEMPO_NOT_ACCEPTED, { cause: e }) : e;
          }),
      ),
    [sendGlobal],
  );
  const setEqLevel = useCallback(
    (level: number) =>
      sendGlobal(
        'eqLevel',
        (g) => withEqLevel(g, level),
        (unit) => unit.write(mbSetGlobalEqLevel(level)),
      ),
    [sendGlobal],
  );
  const setEqGain = useCallback(
    (band: number, gain: number) =>
      sendGlobal(
        `eqGain${band}`,
        (g) => withEqGain(g, band, gain),
        (unit) => unit.write(mbSetGlobalEqGain(band, gain)),
      ),
    [sendGlobal],
  );
  const setEqFrequency = useCallback(
    (target: number | 'lowCut' | 'highCut', hz: number) =>
      sendGlobal(
        `eqFrequency${target}`,
        (g) => withEqFrequency(g, target, hz),
        (unit) => unit.write(mbSetGlobalEqFrequency(target, hz)),
      ),
    [sendGlobal],
  );
  const setEqQ = useCallback(
    (band: number, q: number) =>
      sendGlobal(
        `eqQ${band}`,
        (g) => withEqQ(g, band, q),
        (unit) => unit.write(mbSetGlobalEqQ(band, q)),
      ),
    [sendGlobal],
  );
  const setEqOn = useCallback(
    (on: boolean) =>
      sendGlobal(
        'eqOn',
        (g) => withEqOn(g, on),
        (unit) => mbWriteGlobalEqOn(unit, on),
      ),
    [sendGlobal],
  );

  /** An assignment write (footswitch, expression), then the loaded preset is read again to show what the unit holds. */
  /** Assignment writes, then the loaded preset is read again; resolves with it, null when it failed. */
  const assign = useCallback(
    async (frames: () => readonly Uint8Array[]): Promise<MbPreset | null> => {
      let read: MbPreset | null = null;
      await run('Editing', async (unit) => {
        for (const frame of frames()) await unit.write(frame);
        read = await reloadLoaded(unit);
        patch({ edited: true });
      });
      return read;
    },
    [run, reloadLoaded, patch],
  );

  /** MIDI Control Changes (tuner, tempo): the unit sends no answer. */
  const control = useCallback(
    (messages: () => readonly Uint8Array[]) =>
      run(null, async (unit) => {
        messages().forEach((m) => unit.control(m));
      }),
    [run],
  );

  /** A chain edit, then the loaded preset is read again: the unit picks slots and loads defaults. */
  const chainEdit = useCallback(
    (frame: () => Uint8Array) =>
      run('Editing', async (unit) => {
        await unit.write(frame());
        await reloadLoaded(unit);
        patch({ edited: true });
      }),
    [run, reloadLoaded, patch],
  );

  /**
   * A whole chain (Undo, Redo, the assistant) as one step, planned from what the unit holds; on a
   * failure the unit is put back and read again (matriboxOps.ts applyChain), so the screen never
   * shows a stale chain the next step would be planned from.
   */
  const apply = useCallback(
    async (target: readonly MbChainBlock[]): Promise<{ readonly preset: MbPreset } | { readonly error: string }> => {
      let result: { readonly preset: MbPreset } | { readonly error: string } = { error: 'The Matribox is not connected.' };
      const show = (preset: MbPreset) => setState((s) => ({ ...s, edited: true, unit: s.unit ? { ...s.unit, preset } : s.unit }));
      await run('Editing', async (unit) => {
        try {
          const done = await applyChain(unit, MB_CATALOG, target);
          show(done);
          result = { preset: done };
        } catch (e) {
          if (e instanceof MbApplyError && e.preset) show(e.preset);
          result = { error: message(e) };
          throw e;
        }
      });
      return result;
    },
    [run],
  );

  /** Puts a slot's backup in the list kept in this browser. */
  const keep = useCallback(
    (backup: MbBackup) => {
      backupsRef.current = keepMbBackup(backupsRef.current, backup);
      patch({ backups: backupsRef.current, storageWarning: !storeMbBackups(backupsRef.current) });
    },
    [patch],
  );

  const save = useCallback(
    (index: number, name: string) =>
      run('Saving', async (unit) => {
        await saveToSlot(unit, index, name, keep);
        patch({ unit: await readUnit(unit), edited: false });
      }),
    [run, patch, keep],
  );

  const track = useCallback((verb: 'Backing up' | 'Restoring') => (p: MbProgress) => patch({ progress: { step: `${verb} ${p.label}`, done: p.done, total: p.total } }), [patch]);

  /** After a backup or restore: the progress cleared and the unit read again (a failure here must not hide the first one). */
  const settle = useCallback(
    async (unit: MatriboxLink) => {
      patch({ progress: null });
      try {
        patch({ unit: await readUnit(unit), edited: false });
      } catch (e) {
        console.error('Matribox: could not read the unit again', e);
      }
    },
    [patch],
  );

  /** The loaded preset as the unit plays it now (unsaved edits included), for an export; null when it failed. */
  const readEditBuffer = useCallback(async (): Promise<MbPreset | null> => {
    let preset: MbPreset | null = null;
    await run('Reading', async (unit) => {
      preset = parseMbPreset(await mbReadEditBuffer(unit));
    });
    return preset;
  }, [run]);

  /** Stores a preset from a file in slot `index` (backed up first, read back); the slot stays loaded. False when it failed. */
  const importPreset = useCallback(
    (index: number, preset: MbPreset) =>
      run('Importing', async (unit) => {
        try {
          await importToSlot(unit, index, preset, keep);
        } finally {
          await settle(unit); // the target is loaded now, whatever happened after the select
        }
      }),
    [run, keep, settle],
  );

  /** All 240 presets, each read once loaded; the loaded preset is loaded again (its unsaved edits are lost). Null when it failed. */
  const backupAll = useCallback(async (): Promise<MbBackupAll | null> => {
    let file: MbBackupAll | null = null;
    await run('Backing up', async (unit) => {
      try {
        file = await mbBackupAllPresets(unit, { onProgress: track('Backing up') });
      } finally {
        await settle(unit);
      }
    });
    return file;
  }, [run, track, settle]);

  /** Writes every preset of `file` to its slot, after `before` (the backup-all of the unit, when asked); false when it failed. */
  const restoreAll = useCallback(
    (file: MbBackupAll, before: ((backup: MbBackupAll) => void) | null) =>
      run('Restoring', async (unit) => {
        try {
          if (before) before(await mbBackupAllPresets(unit, { onProgress: track('Backing up') }));
          await mbRestoreAllPresets(unit, file, { onProgress: track('Restoring') });
        } finally {
          await settle(unit);
        }
      }),
    [run, track, settle],
  );

  /**
   * Writes a .clo into CLONE slot `slot` (0-based) under `name`, checked by the unit's answer and the
   * names read back; overwriting cannot be undone (callers confirm first). False when it failed.
   */
  const uploadClone = useCallback(
    (slot: number, clo: Uint8Array, name: string, onProgress?: (step: MbCloneStep) => void) =>
      run('Uploading', async (unit) => {
        const cloneNames = await mbUploadClone(unit, slot, clo, { name, onProgress });
        setState((s) => (s.unit ? { ...s, unit: { ...s.unit, cloneNames } } : s));
      }),
    [run],
  );

  /**
   * Drum machine changes, merged while one is on its way (a slider drag sends the newest values once);
   * shown at once, then as the unit reads back. Resolves with the unit's state, null when it failed
   * (the state is read again then).
   */
  const pendingDrum = useRef<{ change: MbDrumChange; done: Promise<MbDrumState | null> } | null>(null);
  const setDrum = useCallback(
    (change: MbDrumChange): Promise<MbDrumState | null> => {
      if (!link) return Promise.resolve(null);
      setState((s) => (s.drum ? { ...s, drum: mbDrumWith(s.drum, change) } : s));
      const queued = pendingDrum.current;
      if (queued) {
        pendingDrum.current = { ...queued, change: { ...queued.change, ...change } };
        return queued.done;
      }
      let result: MbDrumState | null = null;
      const done = run(null, async (unit) => {
        const latest = pendingDrum.current?.change ?? change;
        pendingDrum.current = null;
        try {
          result = await mbWriteDrum(unit, latest);
          patch({ drum: result });
        } catch (e) {
          patch({ drum: await readDrum(unit) });
          throw e;
        }
      }).then(() => result);
      pendingDrum.current = { change, done }; // the step starts on a later tick (serialQueue), after this
      return done;
    },
    [link, run, patch],
  );

  /** Renames user IR `slot` (0-based), checked by reading the names back. False when it failed. */
  const renameIr = useCallback(
    (slot: number, name: string) =>
      run('Renaming', async (unit) => {
        const irNames = await mbWriteIrName(unit, slot, name);
        setState((s) => (s.unit ? { ...s, unit: { ...s.unit, irNames } } : s));
      }),
    [run],
  );

  return {
    ...state,
    refresh,
    setDrum,
    renameIr,
    uploadClone,
    select,
    setParam,
    setOn,
    changeModel: (slot: number, moduleIndex: number, fxid: number) => chainEdit(() => mbChangeModel(slot, moduleIndex, fxid)),
    addBlock: (position: number, moduleIndex: number, fxid: number) => chainEdit(() => mbAddBlock(position, moduleIndex, fxid)),
    moveBlock: (from: number, to: number) => chainEdit(() => mbMoveBlock(from, to)),
    removeBlock: (position: number) => chainEdit(() => mbRemoveBlock(position)),
    setVolume,
    assignCtrl: (ctrl: number, slot: number, on: boolean) => assign(() => [mbAssignCtrl(ctrl, slot, on)]),
    setFootswitchFunction: (footswitch: number, fn: number) => assign(() => [mbSetFootswitchFunction(footswitch, fn)]),
    assignQuickKnob: (knob: number, target: number | null, paramId: number) => assign(() => mbAssignQuickKnob(knob, target, paramId)),
    assignFrames: (frames: readonly Uint8Array[]) => assign(() => frames),
    assignExpression: (a: MbExpressionAssignment) => assign(() => mbExpressionWrites(a)),
    clearExpression: (entry: number) => assign(() => [mbClearExpression(entry)]),
    control,
    setGlobal,
    setEqLevel,
    setEqGain,
    setEqFrequency,
    setEqQ,
    setEqOn,
    apply,
    save,
    readEditBuffer,
    importPreset,
    backupAll,
    restoreAll,
    clearError: () => patch({ error: null }),
    clearOverload: () => patch({ overload: null }),
  };
}

export type Matribox = ReturnType<typeof useMatribox>;
