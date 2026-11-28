/**
 * The tone assistant on the Matribox II Pro. The model picks models by the real gear they are based
 * on (the built-in catalog) and sends a whole chain or small edits; the editor checks
 * them against the catalog and sends them through its validated writes as one Undo step. Saving
 * only opens the editor's Save dialog.
 */
import {
  CHAT_INSTRUCTIONS_THOROUGH,
  checkMbCloneName,
  mbDefaultCloneName,
  checkMbPresetName,
  mbCheckDspLoad,
  MB_CLONE_SLOTS,
  MB_DRUM_BPM_MAX,
  MB_DRUM_BPM_MIN,
  MB_DRUM_GENRES,
  mbDrumChangeOf,
  mbDrumText,
  mbPresetLabel,
  parseMbPresetLabel,
  type ChatTool,
  type JsonSchema,
  type MbCatalog,
  type MbDrumChange,
  type MbDrumState,
  type MbPreset,
  type TonePage,
} from '@pocket-master/core';
import { SAVE_VERB, type ToneAgent } from './assistant.ts';
import { isEmptyClone, type CloneSource } from './cloneSource.ts';
import type { MbRig } from './matriboxRig.ts';
import type { Lang } from './i18n.ts';
import { type ControlChange, controlWrites, MB_FS_FUNCTION_NAMES, mbControlsText } from './matriboxAssign.ts';
import { findTone, tonePreset, type MbTone } from './matriboxLibrary.ts';
import { editChain, modelOf, planTone, type ChainChange, type MbChainBlock, type ToneBlock } from './matriboxPlan.ts';
import { mbCatalogText, mbChanges, mbModelsText, mbPresetText } from './matriboxText.ts';

/** What the assistant needs from the Matribox editor; every method works on its current state. */
export interface MbAgentHost {
  /** `lang`: the UI language, for the model descriptions the assistant reads. */
  snapshot(): { readonly current: number; readonly preset: MbPreset; readonly catalog: MbCatalog; readonly lang?: Lang };
  /** Sends the chain as one Undo step; resolves with the preset as the unit has it, throws when refused. */
  apply(chain: readonly MbChainBlock[]): Promise<MbPreset>;
  /** Sends assignment writes (footswitches, CTRL, quick knobs, expression); resolves with the preset as the unit has it, throws when refused. */
  assign(frames: readonly Uint8Array[]): Promise<MbPreset>;
  /** The editor's Undo; false when there is nothing to undo. */
  undo(): Promise<boolean>;
  /** Opens the Save dialog filled in; resolves with what the person did. */
  proposeSave(index: number, name: string): Promise<'saved' | 'cancelled'>;
  /** The tones kept in the editor's tone library, newest first. */
  tones(): readonly MbTone[];
  /** Keeps the sound as the unit plays it now in the tone library (nothing is written to the unit). */
  keepTone(name: string, notes: string): Promise<void>;
  /** The 10 CLONE slot names as the unit lists them (an empty slot is "Clone n"). */
  cloneNames(): readonly string[];
  /**
   * Opens the Clones panel filled in (`slot` is 0-based): it loads and converts the source, and the
   * person confirms the overwrite. Resolves with what the person did; throws with the reason when
   * the source could not be loaded or converted.
   */
  proposeClone(proposal: { readonly slot: number; readonly name: string; readonly source: CloneSource }): Promise<'uploaded' | 'cancelled'>;
  /** Changes the drum machine (none: reads it); resolves with its state as the unit reads back, throws when refused. */
  drums(change: MbDrumChange | null): Promise<MbDrumState>;
  /** Where the person plays (none: headphones, PA or interface, which need a cabinet). */
  rig?(): MbRig;
  /** TONE3000 search, when the editor has it set up. */
  tone3000?: { signedIn(): boolean; find(query: string): Promise<TonePage> };
}

const object = (properties: Record<string, JsonSchema>, required: string[]): JsonSchema => ({ type: 'object', properties, required });
const kind = (k: string): JsonSchema => ({ type: 'string', const: k });
const BLOCK: JsonSchema = { type: 'string', description: 'Block of the loaded preset: its 1-based chain position ("2"), or its module name ("DRV") when the chain has only one' };
const MODULE: JsonSchema = { type: 'string', description: 'Module name: DYN, FREQ, WAH, DRV, AMP, CAB, IR, EQ, MOD, DLY, RVB, CLONE, FXLOOP, FXSND, FXRTN or VOL' };
const MODEL: JsonSchema = { type: 'string', description: 'Model name of that module, as the catalog lists it' };
const PARAMS: JsonSchema = {
  type: 'array',
  description: "Values within the ranges list_models gives; parameters not given take the model's default",
  items: object({ name: { type: 'string', description: 'Parameter name, e.g. "Gain"' }, value: { type: 'number' } }, ['name', 'value']),
};
const TONE_BLOCK = object({ module: MODULE, model: MODEL, on: { type: 'boolean', description: 'Default true' }, params: PARAMS }, ['module', 'model']);
const CHANGE: JsonSchema = {
  oneOf: [
    object({ kind: kind('parameter'), block: BLOCK, parameter: { type: 'string', description: "Parameter name of the block's model" }, value: { type: 'number' } }, [
      'kind',
      'block',
      'parameter',
      'value',
    ]),
    object({ kind: kind('block'), block: BLOCK, on: { type: 'boolean' } }, ['kind', 'block', 'on']),
    object({ kind: kind('model'), block: BLOCK, model: MODEL }, ['kind', 'block', 'model']),
    object({ kind: kind('add'), module: MODULE, model: MODEL, position: { type: 'integer', description: '1-based chain position; default: the end' }, on: { type: 'boolean' }, params: PARAMS }, [
      'kind',
      'module',
      'model',
    ]),
    object({ kind: kind('remove'), block: BLOCK }, ['kind', 'block']),
    object({ kind: kind('move'), block: BLOCK, position: { type: 'integer', description: 'New 1-based chain position' } }, ['kind', 'block', 'position']),
  ],
};
const FOOTSWITCH: JsonSchema = { type: 'string', description: 'A, B, C or D' };
const CONTROL: JsonSchema = {
  oneOf: [
    object({ kind: kind('footswitch'), footswitch: FOOTSWITCH, block: BLOCK, toggles: { type: 'boolean', description: 'Default true; false stops it' } }, ['kind', 'footswitch', 'block']),
    object(
      {
        kind: kind('footswitch_function'),
        footswitch: FOOTSWITCH,
        function: { type: 'string', description: `What the switch runs, one of: ${MB_FS_FUNCTION_NAMES.join(', ')}. "CTRL n" toggles the blocks in CTRL n` },
        hold: { type: 'boolean', description: 'true: the long press (default: the press)' },
      },
      ['kind', 'footswitch', 'function'],
    ),
    object({ kind: kind('ctrl'), ctrl: { type: 'integer', minimum: 1, maximum: 4 }, block: BLOCK, member: { type: 'boolean', description: 'Default true; false takes it out' } }, [
      'kind',
      'ctrl',
      'block',
    ]),
    object(
      {
        kind: kind('expression'),
        entry: {
          type: 'integer',
          minimum: 1,
          maximum: 9,
          description: '1-3: EXP 1 mode A (the usual heel-toe pedal, 1 is volume by default); 4-6: EXP 1 mode B (after the toe switch, e.g. wah); 7-9: EXP 2',
        },
        block: BLOCK,
        parameter: { type: 'string', description: "Parameter name of the block's model" },
        min: { type: 'number', description: 'Heel end, 0..100 % of the range (default 0)' },
        max: { type: 'number', description: 'Toe end, 0..100 % (default 100), not below min' },
      },
      ['kind', 'entry', 'block', 'parameter'],
    ),
    object(
      {
        kind: kind('quick_knob'),
        knob: { type: 'integer', minimum: 1, maximum: 3 },
        target: { type: 'string', description: 'A block (as above), or "BPM", "volume" or "none"' },
        parameter: { type: 'string', description: 'Parameter name, for a block' },
      },
      ['kind', 'knob', 'target'],
    ),
  ],
};
const NONE: JsonSchema = { type: 'object', properties: {} };

export const MB_CHAT_TOOLS: readonly ChatTool[] = [
  {
    name: 'get_preset',
    description: "The preset loaded on the Matribox: name, chain in signal order, each block's model, the gear it is based on, on/off and parameter values with ranges.",
    parameters: NONE,
  },
  {
    name: 'list_models',
    description: "The models of the modules asked for (all when none), with the gear each is based on and every parameter's range and default.",
    parameters: object({ modules: { type: 'array', items: MODULE } }, []),
  },
  {
    name: 'build_tone',
    description:
      "Replaces the loaded preset's chain with these blocks, in signal order (input to output, 1 to 12), each with its model, on/off and values. Live only: nothing is saved. Everything is checked before anything is sent, the DSP load included: a chain past the unit's estimated DSP budget, or with more than 2 CAB/IR/CLONE blocks, is refused with what to drop. Returns the preset as it now is.",
    parameters: object({ blocks: { type: 'array', items: TONE_BLOCK } }, ['blocks']),
  },
  {
    name: 'edit_preset',
    description:
      "Small changes to the loaded preset, applied in order (each names blocks as the chain is after the changes before it); a new model starts at its defaults. Live only: nothing is saved. Changes that would take the chain past the unit's estimated DSP budget, or past 2 CAB/IR/CLONE blocks, are refused with what to drop. Returns the preset as it now is.",
    parameters: object({ changes: { type: 'array', items: CHANGE } }, ['changes']),
  },
  {
    name: 'get_controls',
    description:
      'The live controls of the loaded preset: what footswitches A-D run in stomp mode (and the blocks they toggle), the blocks in CTRL 1-4, what quick knobs 1-3 edit, and the expression-pedal entries (block, parameter, heel..toe %).',
    parameters: NONE,
  },
  {
    name: 'set_controls',
    description:
      'Sets live controls of the loaded preset, in order: a footswitch toggling a block (stomp mode, through the CTRL it runs), what a footswitch runs, CTRL 1-4 membership, an expression-pedal entry on a parameter (heel..toe %), a quick knob on a parameter, BPM or the volume. Everything is checked before anything is sent; live only, saved with the preset. Not in Undo. Returns the controls as they now are.',
    parameters: object({ changes: { type: 'array', items: CONTROL } }, ['changes']),
  },
  { name: 'undo_edit', description: "Undoes the last change to the sound (the editor's Undo, also the person's own edits). Nothing is saved.", parameters: NONE },
  { name: 'list_saved_tones', description: "Tones the person kept in the editor's tone library, with the reference each one matches. The first message already lists them.", parameters: NONE },
  {
    name: 'load_saved_tone',
    description:
      'Loads a kept tone into the loaded preset, by its name, as one Undo step. Live only: nothing is saved. Prefer it to rebuilding when a kept tone matches the request: it is exact and costs no extra requests. Returns the preset as it now is.',
    parameters: object({ name: { type: 'string', description: 'Name of a kept tone, as list_saved_tones shows it' } }, ['name']),
  },
  {
    name: 'keep_tone',
    description: "Keeps the sound as it is now in the editor's tone library, so it loads at once next time. Offer it when the person says a tone sounds right; nothing is written to the Matribox.",
    parameters: object(
      {
        name: { type: 'string', description: 'Short name, 1..16 printable ASCII characters (like a preset name)' },
        notes: { type: 'string', description: 'The reference it matches, e.g. "AC/DC, Back in Black, rhythm"' },
      },
      ['name', 'notes'],
    ),
  },
  {
    name: 'save_preset',
    description:
      'Proposes saving the sound to a preset slot under a name: the editor opens its Save dialog filled in, backs the slot up and saves only if the person confirms. Only when the person asked to save.',
    parameters: object({ slot: { type: 'string', description: 'Preset label, 1A..60D (four per bank)' }, name: { type: 'string', description: 'Preset name, 1..16 printable ASCII characters' } }, [
      'slot',
      'name',
    ]),
  },
  { name: 'list_clones', description: 'The names of the 10 CLONE slots (capture slots) of the Matribox; an empty slot shows as empty.', parameters: NONE },
  {
    name: 'search_tone3000',
    description:
      "Searches TONE3000 for NAM amp/pedal captures (only when the person is signed in to TONE3000 in the editor's Clones panel). Returns id, title, creator, gear, number of models and link; credit TONE3000 and the creator when you recommend one.",
    parameters: object({ query: { type: 'string', description: 'What to look for, e.g. "Mesa Rectifier"' } }, ['query']),
  },
  {
    name: 'upload_clone',
    description:
      "Proposes writing a NAM capture (.nam) or a .clo to a CLONE slot, for gear the unit has no model of: the editor's Clones panel opens filled in, converts it (about half a minute) and writes only if the person confirms the overwrite. Give exactly one source: url, or toneId (with modelId when the tone has several models).",
    parameters: object(
      {
        slot: { type: 'integer', description: 'CLONE slot, 1..10', minimum: 1, maximum: MB_CLONE_SLOTS },
        name: { type: 'string', description: 'Capture name, 1..16 printable ASCII characters' },
        url: { type: 'string', description: 'https link to a .nam or .clo the person gave' },
        toneId: { type: 'integer', description: 'TONE3000 tone id, from search_tone3000' },
        modelId: { type: 'integer', description: 'TONE3000 model id of that tone (needed only when it has several)' },
      },
      ['slot', 'name'],
    ),
  },
  {
    name: 'set_drums',
    description:
      "The Matribox's drum machine, for practice: play or stop it, pick a rhythm, set its tempo and volume (all optional; none just reads it). It plays on top of the guitar; nothing is saved to a preset. Returns the state the unit reads back.",
    parameters: object(
      {
        play: { type: 'boolean', description: 'true starts the beat, false stops it' },
        rhythm: {
          type: 'string',
          description: `A style (${MB_DRUM_GENRES.map((g) => g.name).join(', ')}: its first rhythm) or a rhythm name, e.g. "Rock 2", "Hard Rock", "Shuffle", "Funk 3", "Bossanova 1", "Reggae 1", "4/4" (Metronome: 1/4 to 9/8)`,
        },
        bpm: { type: 'integer', minimum: MB_DRUM_BPM_MIN, maximum: MB_DRUM_BPM_MAX, description: "The drums' own tempo (it stops following the preset tempo)" },
        follow_tempo: { type: 'boolean', description: "true: the drums follow the preset's (or the global) tempo instead of their own" },
        volume: { type: 'integer', minimum: 0, maximum: 100 },
      },
      [],
    ),
  },
];

/** The tools that change the sound (or open the Save dialog or the Clones panel). */
const ACTS = new Set(['build_tone', 'edit_preset', 'set_controls', 'undo_edit', 'save_preset', 'load_saved_tone', 'keep_tone', 'upload_clone']);

const INSTRUCTIONS = [
  'You are the tone assistant of an editor for the Sonicake Matribox II Pro guitar multi-effects. The person usually describes a sound (an artist, a record, a song, or words like "warmer").',
  'Work out the gear used on the reference (pedals, amp, cabinet, effects) and pick the models whose origin, the real gear they are based on, matches it: the first message lists every model with its origin. Then build the whole chain with one build_tone, in signal order, with sensible values; call list_models first for the modules whose parameters you set, or leave them at their defaults.',
  'When the person will play the tone live, or names footswitches, the expression pedal or the knobs, set them with set_controls after the chain (e.g. EXP 1 mode B on the wah position, footswitch B toggling the delay, quick knob 1 on the drive gain) and say which does what.',
  'The unit\'s DSP is limited: past it the Matribox shows "System overloaded" and switches every block off. Keep chains lean (usually 5 to 9 blocks, at most 2 CAB/IR/CLONE); the preset text gives an estimated DSP load, and a refused chain says what to drop.',
  'For adjustments ("warmer", "less gain") use edit_preset. Values must be within the ranges given. Say what you did in the same terms as the values.',
  'Do not ask for details the person did not give: make reasonable choices, say briefly what you chose and why, naming the real gear, and invite them to ask for adjustments by ear.',
  'The editor shows every change live, and the person can undo. Nothing is stored until save_preset, which opens the editor\'s Save dialog for the person to confirm; propose it only when the person asks to save (e.g. "on 12A"). Never say a tone is saved unless save_preset answered that the person saved it.',
  'A kept tone in the first message is reused with load_saved_tone only when it matches the request: the same instrument, part and reference, as its notes and gear show; a name that merely mentions the band is not enough, and when in doubt, build the tone. When the person says a tone sounds right, offer to keep it with keep_tone, naming the reference in notes.',
  'The person\'s own captures (NAM captures of real amps and pedals in the CLONE slots, listed in the first message by their names) usually sound fuller and more real than the built-in AMP models: when a capture\'s name matches the amp or drive the reference calls for, or its close family, use that CLONE model in place of the AMP model and say so; never use a capture of different gear just because it is there. After a capture put a CAB/IR only when the sound needs a cabinet (see how the person plays) and the name does not say it holds the speaker ("full rig", "cab"); a capture already boosted ("TS", "808", "boosted" in the name) needs no boost before it, otherwise keep the drive or boost the reference uses. For amps played cranked (Plexi, JCM800, AC30), get the drive from the amp gain and the boost, not from cuts.',
  'For gear the unit has no model of, find a NAM capture (search_tone3000, or a link the person gives) and propose it with upload_clone: the editor opens its Clones panel to convert it (about half a minute) and the person confirms the overwrite of the CLONE slot. Never say a capture is written unless upload_clone says the person wrote it.',
  'To practise ("play a rock beat at 100 BPM"), start the drum machine with set_drums: rhythm, bpm and play: true in one call; say which rhythm plays.',
  'Use as few calls as possible: build_tone and edit_preset already return the resulting preset. Answer in the language the person writes in, in two to four short sentences.',
].join(' ');

const LABEL = /\b(\d{1,2})\s?([a-d])\b/i;

/** The preset (0-based) a message asks to save in ("salva no 12A", "save it to 1D"), or null. */
export function askedToSaveMb(message: string): number | null {
  const label = SAVE_VERB.test(message) ? LABEL.exec(message) : null;
  if (!label) return null;
  try {
    return parseMbPresetLabel(`${label[1]}${label[2]}`);
  } catch {
    return null; // "61A" is not a preset
  }
}

/** The kept tones, one a line: name, notes and the gear its models are based on. */
function tonesText(host: MbAgentHost, catalog: MbCatalog): string {
  return host
    .tones()
    .map((t) => {
      const gear = tonePreset(t)
        .chain.map((b) => modelOf(catalog, b))
        .map((m) => (m ? m.basedOn || m.name : ''))
        .filter(Boolean)
        .join(', ');
      return `- ${t.name}${t.notes ? `: ${t.notes}` : ''}${gear ? ` [${gear}]` : ''}`;
    })
    .join('\n');
}

/** Tone results, one a line, with the credit TONE3000's terms ask for. */
function tonesFound(page: TonePage): string {
  if (page.tones.length === 0) return 'No NAM captures found on TONE3000 for that search.';
  const lines = page.tones.map((t) => `- id ${t.id}: "${t.title}" by ${t.creator || 'unknown'} · gear ${t.gear || 'unknown'} · ${t.modelsCount} model${t.modelsCount === 1 ? '' : 's'} · ${t.url}`);
  return `${lines.join('\n')}\nFrom TONE3000 (tone3000.com); name TONE3000 and the creator when you recommend one.`;
}

const field = (args: unknown, name: string): unknown => (typeof args === 'object' && args !== null ? (args as Record<string, unknown>)[name] : undefined);

/** Sends `chain` once its estimated DSP load is checked (mbCheckDspLoad throws past the limit); a warning near it ends the answer. */
async function applyChecked(host: MbAgentHost, before: readonly MbChainBlock[], chain: readonly MbChainBlock[], now: (p: MbPreset) => string): Promise<string> {
  const note = mbCheckDspLoad(before, chain);
  const text = now(await host.apply(chain));
  return note ? `${text}\n\n${note}` : text;
}

/** Exactly one source: an https `url`, or a `toneId` (with an optional `modelId`). */
function cloneSourceOf(args: unknown): CloneSource {
  const url = field(args, 'url') ?? undefined;
  const toneId = field(args, 'toneId') ?? undefined;
  const modelId = field(args, 'modelId') ?? undefined;
  if ((url === undefined) === (toneId === undefined)) throw new Error('give exactly one source: url, or toneId');
  if (url !== undefined) {
    if (typeof url !== 'string' || !/^https:\/\/\S+$/.test(url) || modelId !== undefined) throw new Error('url must be an https link (and modelId goes with toneId)');
    return { url };
  }
  if (!Number.isInteger(toneId) || (toneId as number) < 1) throw new Error('toneId must be a positive integer');
  if (modelId !== undefined && (!Number.isInteger(modelId) || (modelId as number) < 1)) throw new Error('modelId must be a positive integer');
  return modelId === undefined ? { toneId: toneId as number } : { toneId: toneId as number, modelId: modelId as number };
}

async function run(host: MbAgentHost, name: string, args: unknown): Promise<string> {
  const { preset, catalog, lang } = host.snapshot();
  const now = (p: MbPreset) => mbPresetText(p, catalog);
  switch (name) {
    case 'get_preset':
      return now(preset);
    case 'list_models':
      return mbModelsText(catalog, field(args, 'modules') as string[] | undefined, lang);
    case 'build_tone': {
      const blocks = field(args, 'blocks');
      if (!Array.isArray(blocks)) throw new Error('blocks must be a list');
      return applyChecked(host, preset.chain, planTone(catalog, blocks as ToneBlock[]), now);
    }
    case 'edit_preset':
      return applyChecked(host, preset.chain, editChain(catalog, preset.chain, field(args, 'changes') as ChainChange[]), now);
    case 'get_controls':
      return mbControlsText(preset, catalog);
    case 'set_controls': {
      const changes = field(args, 'changes');
      if (!Array.isArray(changes) || changes.length === 0) throw new Error('changes must be a non-empty list');
      for (const c of changes as ControlChange[]) controlWrites(catalog, preset, c); // checks them all first
      let now = preset;
      for (const c of changes as ControlChange[]) now = await host.assign(controlWrites(catalog, now, c));
      return mbControlsText(now, catalog);
    }
    case 'undo_edit':
      if (!(await host.undo())) throw new Error('there is nothing to undo.');
      return now(host.snapshot().preset);
    case 'list_saved_tones':
      return tonesText(host, catalog) || 'No tones kept yet.';
    case 'load_saved_tone': {
      const toneName = String(field(args, 'name') ?? '').trim();
      const tone = findTone(host.tones(), toneName);
      if (!tone) throw new Error(`no kept tone is called "${toneName}". Kept tones:\n${tonesText(host, catalog) || '(none)'}`);
      return `Loaded the kept tone "${tone.name}".\n\n${now(await host.apply(tonePreset(tone).chain))}`;
    }
    case 'keep_tone': {
      const toneName = checkMbPresetName(String(field(args, 'name') ?? '').trim());
      await host.keepTone(toneName, String(field(args, 'notes') ?? '').trim());
      return `Kept "${toneName}" in the tone library; it loads with load_saved_tone next time.`;
    }
    case 'save_preset': {
      const index = parseMbPresetLabel(String(field(args, 'slot') ?? ''));
      const presetName = checkMbPresetName(String(field(args, 'name') ?? ''));
      const label = mbPresetLabel(index);
      const done = await host.proposeSave(index, presetName);
      return done === 'saved' ? `The person saved it to ${label} "${presetName}".` : `The person closed the Save dialog without saving; ${label} is unchanged.`;
    }
    case 'list_clones': {
      const names = host.cloneNames();
      return Array.from({ length: MB_CLONE_SLOTS }, (_, i) => `CLONE ${i + 1}: ${isEmptyClone(i, names[i] ?? '') ? '(empty)' : (names[i] ?? '').trim()}`).join('\n');
    }
    case 'search_tone3000': {
      if (!host.tone3000) throw new Error('TONE3000 is not set up in this editor.');
      const query = String(field(args, 'query') ?? '').trim();
      if (!query) throw new Error('query must not be empty');
      if (!host.tone3000.signedIn()) throw new Error('the person is not signed in to TONE3000: ask them to sign in to TONE3000 in the Clones panel, then search again.');
      return tonesFound(await host.tone3000.find(query));
    }
    case 'upload_clone': {
      const slot = field(args, 'slot');
      if (!Number.isInteger(slot) || (slot as number) < 1 || (slot as number) > MB_CLONE_SLOTS) throw new Error(`slot must be an integer 1..${MB_CLONE_SLOTS}`);
      const cloneName = checkMbCloneName(String(field(args, 'name') ?? ''));
      const source = cloneSourceOf(args);
      const label = `CLONE ${slot}`;
      const done = await host.proposeClone({ slot: (slot as number) - 1, name: cloneName, source });
      return done === 'uploaded' ? `The person wrote "${cloneName}" to ${label}.` : `The person closed the Clones dialog; ${label} is unchanged.`;
    }
    case 'set_drums':
      return mbDrumText(
        await host.drums(
          mbDrumChangeOf({ play: field(args, 'play'), rhythm: field(args, 'rhythm'), bpm: field(args, 'bpm'), followTempo: field(args, 'follow_tempo'), volume: field(args, 'volume') }),
        ),
      );
    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

/** The filled CLONE slots by the model name build_tone takes ("Clone 2": "Plexi"); empty slots left out. */
const capturesText = (host: MbAgentHost): string =>
  host
    .cloneNames()
    .map((name, i) => (isEmptyClone(i, name) ? null : `- ${mbDefaultCloneName(i)}: "${name.trim()}"`))
    .filter((line) => line !== null)
    .join('\n');

export function matriboxAgent(host: MbAgentHost): ToneAgent {
  const presetText = () => {
    const s = host.snapshot();
    return mbPresetText(s.preset, s.catalog);
  };
  return {
    tools: host.tone3000 ? MB_CHAT_TOOLS : MB_CHAT_TOOLS.filter((t) => t.name !== 'search_tone3000'),
    acts: ACTS,
    instructions: (thorough) => (thorough ? `${INSTRUCTIONS} ${CHAT_INSTRUCTIONS_THOROUGH}` : INSTRUCTIONS),
    context: (thorough) => {
      const { catalog } = host.snapshot();
      const tones = tonesText(host, catalog);
      const captures = capturesText(host);
      const plays = host.rig?.() === 'amp-return' ? "How the person plays: into a real amp's FX return (its power amp and speaker are the cabinet), so put no CAB or IR blocks and say so.\n\n" : '';
      return `${plays}Loaded preset:\n${presetText()}\n\nModels by module (name, then the gear it is based on):\n${mbCatalogText(catalog, thorough)}${captures ? `\n\nYour captures (CLONE slots):\n${captures}` : ''}${tones ? `\n\nSaved tones (load_saved_tone):\n${tones}` : ''}`;
    },
    current: presetText,
    runner: () => {
      // The preset this message works on: the person loading another one stops the sound changes.
      let working = host.snapshot().current;
      return async (name, args) => {
        const s = host.snapshot();
        if (name === 'get_preset') working = s.current;
        if (ACTS.has(name) && s.current !== working) {
          return {
            ok: false,
            text: `Error: the preset changed to ${mbPresetLabel(s.current)} "${s.preset.name}" while you were working (the person loaded it). Call get_preset and check the request still applies before changing anything.`,
          };
        }
        try {
          return { ok: true, text: await run(host, name, args) };
        } catch (error) {
          return { ok: false, text: `Error: ${error instanceof Error ? error.message : String(error)}` };
        }
      };
    },
    watch: (off) => {
      const before = host.snapshot();
      return (moved) => {
        const after = host.snapshot();
        return before.current !== after.current && !moved.saved ? undefined : mbChanges(before.preset, after.preset, after.catalog, off);
      };
    },
    offerSave: (message) => {
      const index = askedToSaveMb(message);
      if (index === null) return null;
      void host.proposeSave(index, host.snapshot().preset.name.trim());
      return mbPresetLabel(index);
    },
  };
}
