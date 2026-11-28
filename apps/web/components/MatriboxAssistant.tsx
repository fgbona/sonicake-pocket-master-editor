'use client';

import { useMemo, useRef, useState } from 'react';
import { MB_CATALOG } from '@pocket-master/core';
import { useAiAgent } from '@/lib/aiBridge';
import { matriboxAgent } from '@/lib/matriboxAgent';
import { loadMbRig, saveMbRig, type MbRig } from '@/lib/matriboxRig';
import { keepMbTone, mbLibraryNow, mbTone } from '@/lib/matriboxLibrary';
import type { CloneSource } from '@/lib/cloneSource';
import type { Matribox } from '@/lib/useMatribox';
import type { MatriboxHistory } from '@/lib/useMatriboxHistory';
import type { useTone3000 } from '@/lib/useTone3000';
import { AssistantPanel } from './AssistantPanel';
import { useI18n } from './I18n';

interface Props {
  mb: Matribox;
  history: MatriboxHistory;
  /** Opens the Save dialog filled in; resolves with what the person did. */
  proposeSave: (index: number, name: string) => Promise<'saved' | 'cancelled'>;
  /** Opens the Clones panel filled in (slot 0-based); resolves with what the person did. */
  proposeClone: (slot: number, name: string, source: CloneSource) => Promise<'uploaded' | 'cancelled'>;
  t3k: ReturnType<typeof useTone3000>;
}

/** The tone assistant on the Matribox: it picks models from the built-in catalog by the gear they are based on. */
export function MatriboxAssistant({ mb, history, proposeSave, proposeClone, t3k }: Props) {
  const { lang, t } = useI18n();
  const [rig, setRig] = useState<MbRig>(loadMbRig);
  // The agent stays the same across renders and reads the editor as it is now.
  const latest = useRef({ mb, history, proposeSave, proposeClone, t3k, lang, rig });
  latest.current = { mb, history, proposeSave, proposeClone, t3k, lang, rig };
  const agent = useMemo(
    () =>
      matriboxAgent({
        snapshot: () => {
          const { mb: now, history: steps, lang: language } = latest.current;
          if (!now.unit) throw new Error('The Matribox is not there any more.');
          return { current: now.unit.current, preset: steps.preset() ?? now.unit.preset, catalog: MB_CATALOG, lang: language };
        },
        apply: (chain) => latest.current.history.applyChain(chain),
        assign: async (frames) => {
          const read = await latest.current.mb.assignFrames(frames);
          if (!read) throw new Error('The Matribox did not take the change (see the error above the chain).');
          return read;
        },
        undo: () => latest.current.history.undo(),
        drums: async (change) => {
          const now = latest.current.mb;
          if (!change) {
            if (!now.drum) throw new Error('The drum machine did not answer.');
            return now.drum;
          }
          const state = await now.setDrum(change);
          if (!state) throw new Error('The Matribox did not take the drum machine change (see the error above the chain).');
          return state;
        },
        proposeSave: (index, name) => latest.current.proposeSave(index, name),
        cloneNames: () => latest.current.mb.unit?.cloneNames ?? [],
        rig: () => latest.current.rig,
        proposeClone: ({ slot, name, source }) => latest.current.proposeClone(slot, name, source),
        tone3000: t3k.configured ? { signedIn: () => latest.current.t3k.signedIn, find: (query) => latest.current.t3k.find(query, 'nam') } : undefined,
        tones: mbLibraryNow,
        keepTone: async (name, notes) => {
          const preset = await latest.current.mb.readEditBuffer();
          if (!preset) throw new Error('The edit buffer could not be read from the Matribox.');
          keepMbTone(mbTone(preset, name, notes));
        },
      }),
    [t3k.configured], // a build-time constant
  );
  // The desktop app's AI connection drives the same tools while this editor is up.
  useAiAgent('matribox', agent);
  const options = (
    <label className="mb-rig">
      {t('mb.rig')}
      <select
        value={rig}
        onChange={(e) => {
          const next = e.target.value === 'amp-return' ? 'amp-return' : 'full';
          setRig(next);
          saveMbRig(next);
        }}
      >
        <option value="full">{t('mb.rigFull')}</option>
        <option value="amp-return">{t('mb.rigReturn')}</option>
      </select>
    </label>
  );
  return <AssistantPanel agent={agent} hint="mb.assistantHint" privacy="mb.assistantPrivacy" options={options} />;
}
