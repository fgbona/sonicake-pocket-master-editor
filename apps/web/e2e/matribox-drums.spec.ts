import type { Locator, Page } from '@playwright/test';
import { connectMatribox, expect, test, openDock } from './matribox-fixtures.ts';

/** Types a value into a knob: the value button, the text field, Enter. */
async function typeKnob(panel: Locator, label: string, value: string) {
  await panel.getByRole('button', { name: `Type a value for “${label}”` }).click();
  await panel.getByRole('textbox', { name: `${label} value` }).fill(value);
  await panel.getByRole('textbox').press('Enter');
}

/** Delivers a frame the simulated unit sends on its own (no request from the editor). */
const fromUnit = (page: Page, frame: Uint8Array) => page.evaluate((bytes) => window.__midi.receive('Matribox II PRO', bytes), Array.from(frame));

async function openPanel(page: Page, title: string) {
  await connectMatribox(page);
  await openDock(page, title === 'User IRs' ? 'Clones & IRs' : 'Controls');
  const panel = page.getByRole('region', { name: title });
  await panel.locator('summary').click();
  return panel;
}

test('the drum machine panel starts a rhythm, sets its tempo and volume, read back from the unit', async ({ page, unit }) => {
  const drums = await openPanel(page, 'Drum machine');
  await drums.getByRole('combobox', { name: 'Style' }).selectOption({ label: 'Funk' });
  await expect.poll(() => [unit.drum.genre, unit.drum.pattern]).toEqual([2, 0]);
  await drums.getByRole('combobox', { name: 'Rhythm' }).selectOption({ label: 'Funk 3' });
  await expect.poll(() => unit.drum.pattern).toBe(2);
  await typeKnob(drums, 'Drum tempo', '100');
  await expect.poll(() => unit.drum.bpm).toBe(100);
  await typeKnob(drums, 'Drum volume', '70');
  await expect.poll(() => unit.drum.volume).toBe(70);
  await drums.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => unit.drum.playing).toBe(true);
  await expect(drums.getByRole('button', { name: 'Stop' })).toBeVisible();
  await drums.getByRole('switch', { name: 'Follow the preset tempo' }).click();
  await expect.poll(() => unit.drum.follow).toBe(true);
  await expect(drums.getByRole('slider', { name: /^Drum tempo/ })).toHaveAttribute('aria-disabled', 'true');
});

test('the drum machine panel follows the changes made on the unit', async ({ page, unit }) => {
  const drums = await openPanel(page, 'Drum machine');
  await fromUnit(page, unit.onUnitDrum(0x84, 90));
  await expect(drums.getByRole('slider', { name: /^Drum tempo/ })).toHaveAttribute('aria-valuenow', '90');
  await fromUnit(page, unit.onUnitDrum(0x82, (7 << 16) | 3)); // Metronome, 4/4
  await expect(drums.getByRole('combobox', { name: 'Rhythm' })).toHaveValue('3');
  await expect(drums.getByRole('combobox', { name: 'Rhythm' }).locator('option:checked')).toHaveText('4/4');
  await fromUnit(page, unit.onUnitDrum(0x81, 1));
  await expect(drums.getByRole('button', { name: 'Stop' })).toBeVisible();
});

test('a user IR is renamed in place, checked in the names the unit reads back', async ({ page }) => {
  const irs = await openPanel(page, 'User IRs');
  await irs.getByRole('button', { name: 'Rename IR 3', exact: true }).click();
  const field = irs.getByRole('textbox', { name: 'New name for IR 3' });
  await field.fill('   '); // blank: not a name
  await expect(irs.getByText('1 to 16 characters')).toBeVisible();
  await expect(irs.getByRole('button', { name: 'Rename', exact: true })).toBeDisabled();
  await field.fill('Mesa 4x12');
  await irs.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(irs.getByRole('listitem').filter({ hasText: 'IR 3 ' }).first()).toContainText('Mesa 4x12');
  await expect(field).toHaveCount(0);
});
