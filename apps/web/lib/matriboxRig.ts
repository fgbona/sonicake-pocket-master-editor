/**
 * Where the person plays the Matribox: through headphones, a PA or an interface (the sound needs a
 * cabinet, CAB or IR), or into a real amp's FX return (its power amp and speaker are the cabinet).
 * Kept per browser; a storage that throws or is empty gives the default.
 */
export type MbRig = 'full' | 'amp-return';

const KEY = 'mb.rig';

export function loadMbRig(): MbRig {
  try {
    return localStorage.getItem(KEY) === 'amp-return' ? 'amp-return' : 'full';
  } catch {
    return 'full';
  }
}

export function saveMbRig(rig: MbRig): void {
  try {
    localStorage.setItem(KEY, rig);
  } catch {
    // private window or blocked storage: the choice lasts until the page closes
  }
}
