/**
 * The rig view's gear drawings (components/rig/RigIcon.tsx), as data: which kind of gear a block
 * is, and how one model's drawing differs from another's of the same kind. Everything follows from
 * the block's module and model id, so a model always looks the same and two models rarely alike.
 * Drawings are generic shapes and colours: no maker's look, name or logo.
 */
import { ampSkin } from './ampSkins.ts';
import { mbAmpSkin, mbModuleKey } from './matriboxLook.ts';

export const RIG_CATEGORIES = ['drive', 'comp', 'eq', 'mod', 'delay', 'reverb', 'treadle', 'head', 'combo', 'cab', 'gate', 'rack', 'clone', 'ir'] as const;
export type RigCategory = (typeof RIG_CATEGORIES)[number];

/** Finishes kept by amp makers for combos (open-backed cabinets with the speaker in the same box). */
const COMBO_SKINS = new Set(['tweed', 'blackface', 'vox', 'jazz']);

interface BlockLike {
  readonly module: string;
  readonly model: { readonly name: string; readonly basedOn: string } | null;
}

/** The kind of gear a Matribox block is drawn as. */
export function rigCategory(block: BlockLike): RigCategory {
  const name = block.model?.name ?? '';
  switch (mbModuleKey(block.module)) {
    case 'dyn':
      return /gate/i.test(name) ? 'gate' : 'comp';
    case 'drv':
      return 'drive';
    case 'freq':
    case 'mod':
      return 'mod';
    case 'wah':
    case 'vol':
      return 'treadle';
    case 'amp':
      return COMBO_SKINS.has(mbAmpSkin(block.model?.basedOn ?? '') ?? '') ? 'combo' : 'head';
    case 'cab':
      return 'cab';
    case 'ir':
      return 'ir';
    case 'eq':
      return 'eq';
    case 'dly':
      return 'delay';
    case 'rvb':
      return 'reverb';
    case 'clone':
      return 'clone';
    default:
      return 'rack';
  }
}

/** The kind of gear a Pocket Master block is drawn as: its block key, the model for the two FX slots and the IR. */
export function pmRigCategory(block: { readonly key: string; readonly model: string }, ampMode: 'normal' | 'clone'): RigCategory {
  const name = block.model;
  switch (block.key) {
    case 'nr':
      return 'gate';
    case 'fx1':
    case 'fx2':
      return /comp/i.test(name) ? 'comp' : /wah/i.test(name) ? 'treadle' : /boost/i.test(name) ? 'drive' : /octave|pitch|detune/i.test(name) ? 'rack' : 'mod';
    case 'drv':
      return 'drive';
    case 'amp':
      return ampMode === 'clone' ? 'clone' : COMBO_SKINS.has(ampSkin(name) ?? '') ? 'combo' : 'head';
    case 'ir':
      return /^user ir/i.test(name) ? 'ir' : 'cab';
    case 'eq':
      return 'eq';
    case 'dly':
      return 'delay';
    case 'rvb':
      return 'reverb';
    default:
      return 'rack';
  }
}

/** Enclosure paints for pedals and rack units; tolex for amps and cabinets. Mid tones: they read on both themes. */
const PEDAL_PAINT = ['#c8443a', '#d98e1f', '#2f7fc1', '#2e9a5d', '#8b55b5', '#5f6f80', '#d6c69a', '#1f9e95', '#c7ccd1', '#33363b'] as const;
const TOLEX = ['#2a2a2d', '#3b2f2a', '#d8c9a3', '#6d4a33', '#7a2630', '#22385c', '#e3dccb'] as const;
const LEDS = ['#ff453a', '#30d158', '#0a84ff', '#ffd60a'] as const;
/** Most knobs a drawing has room for. */
const MAX_KNOBS: Record<RigCategory, number> = {
  drive: 4,
  comp: 4,
  eq: 7,
  mod: 4,
  delay: 4,
  reverb: 4,
  treadle: 0,
  head: 6,
  combo: 6,
  cab: 0,
  gate: 3,
  rack: 5,
  clone: 5,
  ir: 0,
};

export interface RigIconSpec {
  readonly category: RigCategory;
  readonly body: string;
  /** Knobs (faders on the EQ), 1..the drawing's room; 0 for gear without them. */
  readonly knobs: number;
  readonly led: string;
  /** A stompbox's switch: a round footswitch or a flat toggle. */
  readonly footswitch: 'round' | 'flat';
  /** Speakers in a cabinet: 1, 2 or 4. */
  readonly speakers: 1 | 2 | 4;
}

/** FNV-1a: a small stable hash, the same in every browser. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Speakers as a cabinet's name counts them ("2x12"), else from the hash. */
function speakersOf(name: string, h: number): 1 | 2 | 4 {
  const n = Number(/(\d)\s*x\s*\d/i.exec(name)?.[1]);
  if (n >= 4) return 4;
  if (n === 2 || n === 3) return 2;
  if (n === 1) return 1;
  return ([1, 2, 4] as const)[h % 3] ?? 1;
}

/**
 * One model's drawing: `id` names the model (module and fxid), `params` its parameter count (the
 * knobs drawn), `name` its display name (a cabinet's speaker count).
 */
export function rigIconSpec(category: RigCategory, id: string, params: number, name = ''): RigIconSpec {
  const h = hash(`${category}:${id}`);
  const amp = category === 'head' || category === 'combo' || category === 'cab' || category === 'clone';
  const paints = amp ? TOLEX : PEDAL_PAINT;
  const room = MAX_KNOBS[category];
  return {
    category,
    body: paints[h % paints.length] as string,
    knobs: room === 0 ? 0 : Math.max(1, Math.min(room, params)),
    led: LEDS[(h >>> 8) % LEDS.length] as string,
    footswitch: (h >>> 12) % 3 === 0 ? 'flat' : 'round',
    speakers: speakersOf(name, h >>> 16),
  };
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Light paints get dark ink for the face's marks, dark paints light ink. */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.3 ? '#1c1c1e' : '#f5f5f7';
}

/** Text printed on a paint: black or white, whichever contrasts more (at least 4.58:1 on any colour). */
export function textOn(hex: string): '#000000' | '#ffffff' {
  return luminance(hex) > 0.179 ? '#000000' : '#ffffff';
}

/** Every paint a drawing can take, for checks. */
export const RIG_PAINTS: readonly string[] = [...PEDAL_PAINT, ...TOLEX];
