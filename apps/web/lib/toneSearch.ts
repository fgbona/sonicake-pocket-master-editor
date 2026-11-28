/** Small rules of the manual TONE3000 search in the Clones & IRs tab. */

/** Gear types TONE3000 filters by (the API's `gears` values). */
export const TONE_GEARS = ['amp', 'pedal', 'full-rig', 'outboard'] as const;
export type ToneGear = (typeof TONE_GEARS)[number];

/** A tone's title as a CLONE name: printable ASCII only, whitespace collapsed, at most 16 characters. */
export const cloneNameFromTitle = (title: string): string =>
  title
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
    .trim();
