/**
 * A page whose Web MIDI is a fake "Matribox II PRO" port wired to the core suite's simulated unit
 * (packages/core/test/fake-matribox.ts) in this process; never a real device. The editor uses its
 * built-in model catalog; MODELS are the ones of the simulated unit's "Drive AD".
 */
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { FakeMatribox } from '../../../packages/core/test/fake-matribox.ts';
import { MB_CATALOG, type MbModel } from '@pocket-master/core';
import { openDock, wireMidi } from './fixtures.ts';

/** The frames the simulated unit answers one frame from the editor with. */
export async function answer(unit: FakeMatribox, bytes: Uint8Array): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  unit.listen((frame) => void out.push(frame));
  unit.send(bytes);
  await new Promise((resolve) => setImmediate(resolve)); // the fake answers on the next turn, as the USB link does
  return out;
}

/** A simulated unit that answers quietly (the link skips notifications; keep the e2e traffic small). */
export function quietMatribox(): FakeMatribox {
  const unit = new FakeMatribox();
  unit.noise = [];
  return unit;
}

export const test = base.extend<{ unit: FakeMatribox }>({
  unit: [
    async ({ page }, use) => {
      const unit = quietMatribox();
      await wireMidi(page, { 'Matribox II PRO': (bytes) => answer(unit, bytes) }, { plugged: ['Matribox II PRO'], denials: 0 });
      await use(unit);
    },
    { auto: true },
  ], // always: a page here must never reach the real Web MIDI
});
export { expect, openDock };

const builtIn = (module: string, fxid: number): MbModel => {
  const model = MB_CATALOG.modules.find((m) => m.name === module)?.models.find((m) => m.fxid === fxid);
  if (!model) throw new Error(`the built-in catalog has no ${module} 0x${fxid.toString(16)}`);
  return model;
};
/** Built-in models the tests use: the ones of "Drive AD", then the ones they change to. */
export const MODELS = {
  gate: builtIn('DYN', 0x1b),
  drive: builtIn('DRV', 0x0300002a),
  amp: builtIn('AMP', 0x0700001a),
  cab: builtIn('CAB', 0x0a000006),
  hall: builtIn('RVB', 0x0c00000b),
  volume: builtIn('VOL', 0x06000003),
  od: builtIn('DRV', 0x03000010),
  echo: builtIn('DLY', 0x0b000001),
};
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A model menu option's accessible name: the model (with a ✓ when chosen), then the gear it is based on. */
export const optionName = (model: MbModel) => new RegExp(`^✓?${escapeRegExp(model.name)}${model.basedOn ? ` ${escapeRegExp(model.basedOn)}` : ''}$`);

/** The heading of the preset the simulated Matribox has loaded. */
export const loadedMatribox = (page: Page) => page.getByRole('heading', { name: '17C Drive AD' });

/** Opens the editor, which finds the plugged-in Matribox by itself; returns once its loaded preset shows. */
export async function connectMatribox(page: Page) {
  await page.goto('/');
  await expect(loadedMatribox(page)).toBeVisible();
}

/**
 * Waits until the editor stops sending (the dev server's strict mode reads the unit twice on
 * connect), so a test can count the requests one action causes.
 */
export async function settled(unit: FakeMatribox) {
  let last = -1;
  await expect
    .poll(async () => {
      const now = unit.received.length;
      const same = now === last;
      last = now;
      await new Promise((resolve) => setTimeout(resolve, 250));
      return same && unit.received.length === now;
    })
    .toBe(true);
}

/** The chain as its tiles name it, "DYN → DRV → …", once it shows exactly that. */
export async function expectChain(page: Page, modules: string) {
  await expect.poll(async () => (await page.locator('.tiles .tile-label').allTextContents()).filter((m) => m !== 'Add').join(' → ')).toBe(modules);
}

/** The panel of the block at `position`, selected from its tile first. */
export async function blockPanel(page: Page, position: number, module: string) {
  await page.getByRole('button', { name: new RegExp(`^Edit ${position}\\. ${module}:`) }).click();
  return page.getByRole('region', { name: `${position}. ${module} block` });
}

/** Turns a knob (role slider) to `value` from the keyboard: Home, then tenths of its range, then single steps. */
export async function turnKnob(knob: Locator, value: number) {
  const min = Number(await knob.getAttribute('aria-valuemin'));
  const max = Number(await knob.getAttribute('aria-valuemax'));
  const tenth = (max - min) / 10;
  // Each key waits for the knob to show its step: the knob reads its value from the last render.
  let now = min;
  const press = async (key: string, step: number) => {
    now += step;
    await knob.press(key);
    await expect(knob).toHaveAttribute('aria-valuenow', String(now));
  };
  // A knob ignores keys while the editor is busy (a read or a chain edit still running).
  await expect(knob).toHaveAttribute('aria-disabled', 'false');
  await knob.focus();
  await press('Home', 0);
  for (let i = 0; i < Math.floor((value - min) / tenth); i++) await press('PageUp', tenth);
  for (let i = 0; i < Math.round((value - min) % tenth); i++) await press('ArrowUp', 1);
}
