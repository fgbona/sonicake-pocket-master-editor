/**
 * The Matribox II Pro's global settings as the editor shows them (core globals.ts): read on
 * connect, changed by the editor's writes and by the unit's own notices. Pure updates only.
 */
import { mbReadGlobalState, type MatriboxLink, type MbGlobalSetting, type MbGlobalState } from '@pocket-master/core';
import { en } from './messages.ts';

/** The three global reads; null (logged) when the unit does not answer them, so the editor still opens. */
export async function readGlobals(link: MatriboxLink): Promise<MbGlobalState | null> {
  try {
    return await mbReadGlobalState(link);
  } catch (e) {
    console.error('Matribox: could not read the global settings', e);
    return null;
  }
}

export const withGlobal = (g: MbGlobalState, setting: MbGlobalSetting, value: number): MbGlobalState => ({ ...g, general: { ...g.general, [setting]: value } });

export const withEqLevel = (g: MbGlobalState, level: number): MbGlobalState => ({ ...g, eq: { ...g.eq, level } });

export const withEqGain = (g: MbGlobalState, band: number, gain: number): MbGlobalState => ({ ...g, eq: { ...g.eq, bands: g.eq.bands.map((b, i) => (i === band ? { ...b, gain } : b)) } });

export const withEqFrequency = (g: MbGlobalState, target: number | 'lowCut' | 'highCut', frequency: number): MbGlobalState =>
  typeof target === 'number'
    ? { ...g, eq: { ...g.eq, bands: g.eq.bands.map((b, i) => (i === target ? { ...b, frequency } : b)) } }
    : { ...g, eq: { ...g.eq, [target]: { ...g.eq[target], frequency } } };

export const withEqQ = (g: MbGlobalState, band: number, q: number): MbGlobalState => ({ ...g, eq: { ...g.eq, bands: g.eq.bands.map((b, i) => (i === band ? { ...b, q } : b)) } });

export const withEqOn = (g: MbGlobalState, eqOn: boolean): MbGlobalState => ({ ...g, eqOn });

/** The unit's MIDI channel for the editor's Control Changes: its USB input channel, or null for Omni (any channel). */
export const ccChannelOf = (g: MbGlobalState | null): number | null => (g && g.general.midiInUsb >= 1 ? g.general.midiInUsb : null);

/** Global Tempo switched on but not confirmed: the unit asks on its screen first (or has no BPM yet). */
export const TEMPO_NOT_ACCEPTED = en['error.mbTempoNotAccepted'];
