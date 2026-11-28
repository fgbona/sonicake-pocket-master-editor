import { test, expect, connect, openDock } from './fixtures.ts';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const amp = (page: Page) => page.locator('section.block-amp');

/** A synthetic .prst (the file Sonicake's app exports) holding the IRON-LEAD fixture's sound under `name`. */
function prst(name: string) {
  const json = readFileSync(new URL('../../../packages/core/test/fixtures/preset-files/v1-iron-lead.json', import.meta.url), 'utf8');
  const payload = Buffer.from(JSON.parse(json).payload, 'hex');
  const field = (text: string, size: number) => Array.from({ length: size }, (_, i) => text.charCodeAt(i) || 0);
  const bytes = [...field('Pocket Master', 20), 0x0b, 0xff, 0xff, 0xff, 0xff, ...field(name, 16), ...payload.subarray(2)];
  return { name: `${name}.prst`, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) };
}

async function pickAmp(page: Page, model: string) {
  await amp(page).locator('.picker-button').click();
  await page.getByRole('option', { name: new RegExp(`^${model}\\b`) }).click();
}

test('reads the loaded preset, its chain and the slot names', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Clones & IRs');
  await expect(page.getByRole('heading', { name: /P09\s*IRON-LEAD/ })).toBeVisible();
  await expect(amp(page).getByText('Brit 800')).toBeVisible();
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'marshall');
  await expect(page.getByRole('region', { name: 'Pedal slots' }).getByText('Randall SA')).toBeVisible();
});

test('controls are live as soon as the pedal is connected, with no switch to turn on', async ({ page, pedal }) => {
  await connect(page, pedal);
  await expect(amp(page).getByRole('slider', { name: /gain/i })).toHaveAttribute('aria-disabled', 'false');
  await expect(page.getByRole('switch', { name: 'Live edit' })).toHaveCount(0);
});

test('live edit sends a knob turn and a model change to the pedal', async ({ page, pedal }) => {
  await connect(page, pedal);
  const gain = amp(page).getByRole('slider', { name: /gain/i });
  const before = Number(await gain.getAttribute('aria-valuenow'));
  await gain.focus();
  await page.keyboard.press('ArrowUp');
  await expect(gain).toHaveAttribute('aria-valuenow', String(before + 1));
  await expect.poll(() => pedal.pedal.received).toContain('edit 48');

  await pickAmp(page, 'Calif DualM');
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'mesa');
  await expect.poll(() => pedal.pedal.received).toContain('edit 47');
});

test('revert reloads the preset as it was first read', async ({ page, pedal }) => {
  await connect(page, pedal);
  await pickAmp(page, 'Calif DualM');
  await expect(amp(page).getByText('Calif DualM')).toBeVisible();
  await page.getByRole('button', { name: 'Revert' }).click();
  await expect(amp(page).getByText('Brit 800')).toBeVisible();
  expect(pedal.pedal.received).toContain('select 8');
});

test('loading another preset asks before discarding unsaved changes', async ({ page, pedal }) => {
  await connect(page, pedal);
  await pickAmp(page, 'Calif DualM');
  await page.getByRole('button', { name: /Load P10/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard the changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: /P09/ })).toBeVisible();
  expect(pedal.pedal.current).toBe(8);

  await page.getByRole('button', { name: /Load P10/ }).click();
  await page.getByRole('button', { name: 'Discard and load' }).click();
  await expect(page.getByRole('heading', { name: /P10\s*THR-CLEAN/ })).toBeVisible();
  expect(pedal.pedal.current).toBe(9);
});

test('saves to the loaded slot after backing it up, and checks it on the pedal', async ({ page, pedal }) => {
  await connect(page, pedal);
  await pickAmp(page, 'Calif DualM');
  await page.getByRole('button', { name: 'Save…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save to a preset slot' });
  await dialog.getByLabel('Name').fill('E2E RECT');
  await dialog.getByRole('button', { name: 'Save to P09' }).click();
  await expect(page.getByText('Saved to P09 as “E2E RECT” and checked on the pedal.')).toBeVisible();
  expect(pedal.pedal.names[8]).toBe('E2E RECT');
  expect(pedal.pedal.received).toContain('save 8 E2E RECT');
});

test('a comment on a captured profile shows next to it in the AMP menu', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Clones & IRs');
  const slots = page.getByRole('region', { name: 'Pedal slots' });
  await slots.getByRole('button', { name: 'Comment' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Comment for Randall SA' });
  await dialog.getByRole('textbox').fill('Randall Satan, high gain');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(slots.getByText('Randall Satan, high gain')).toBeVisible();
  await amp(page).locator('.picker-button').click();
  await expect(page.getByRole('option', { name: /Randall SA.*Randall Satan, high gain/ })).toBeVisible();
});

test('a save writes the slot right away, without a backup step', async ({ page, pedal }) => {
  await connect(page, pedal);
  const original = Array.from(pedal.pedal.slots[8]!);
  await pickAmp(page, 'Calif DualM');
  await page.getByRole('button', { name: 'Save…' }).click();
  const save = page.getByRole('dialog', { name: 'Save to a preset slot' });
  await expect(save.getByRole('checkbox')).toHaveCount(0);
  await save.getByLabel('Name').fill('E2E RECT');
  await save.getByRole('button', { name: 'Save to P09' }).click();
  await expect(page.getByText(/Saved to P09/)).toBeVisible();
  expect(pedal.pedal.names[8]).toBe('E2E RECT');
  expect(Array.from(pedal.pedal.slots[8]!)).not.toEqual(original);
  await save.getByRole('button', { name: 'Done' }).click();
  await openDock(page, 'Backups');
  await expect(page.getByRole('region', { name: 'Backups' }).getByText('Backups taken before a restore')).toBeVisible();
});

test('undo and redo step through live edits, a knob turn counting as one step', async ({ page, pedal }) => {
  await connect(page, pedal);
  const gain = amp(page).getByRole('slider', { name: /gain/i });
  const before = Number(await gain.getAttribute('aria-valuenow'));
  await gain.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await expect(gain).toHaveAttribute('aria-valuenow', String(before + 3));
  await pickAmp(page, 'Calif DualM');
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'mesa');

  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await undo.click();
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'marshall');
  await expect(gain).toHaveAttribute('aria-valuenow', String(before + 3));
  await undo.click();
  await expect(gain).toHaveAttribute('aria-valuenow', String(before));
  await expect(undo).toBeDisabled();
  // The pedal holds what the screen shows.
  await expect.poll(() => pedal.pedal.editBuffer.join()).toBe(pedal.pedal.slots[8]!.join());

  await redo.click();
  await expect(gain).toHaveAttribute('aria-valuenow', String(before + 3));
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'mesa');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'marshall');
});

test('importing a preset file first shows what it changes from the loaded preset', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Library');
  await pickAmp(page, 'Calif DualM');
  await page
    .getByText('Import preset')
    .locator('input[type=file]')
    .setInputFiles(new URL('../../../packages/core/test/fixtures/preset-files/v1-iron-lead.json', import.meta.url).pathname);
  const dialog = page.getByRole('dialog', { name: 'Import a preset' });
  const changes = dialog.getByRole('region', { name: 'What changes from the loaded preset' });
  await expect(changes.getByRole('listitem').filter({ hasText: 'AMP Model' })).toContainText('Calif DualM → Brit 800');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(amp(page).getByText('Calif DualM')).toBeVisible();
});

test('a .prst from the Sonicake app imports like a preset file, compared first', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Library');
  await pickAmp(page, 'Calif DualM');
  await page.getByText('Import preset').locator('input[type=file]').setInputFiles(prst('SONIC-LEAD'));
  const dialog = page.getByRole('dialog', { name: 'Import a preset' });
  await expect(dialog.getByText('Load “SONIC-LEAD” into the edit buffer?')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'What changes from the loaded preset' })).toContainText('Calif DualM → Brit 800');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('the preset-file import is reachable by keyboard: Tab focuses it and Enter opens the file picker', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Library');
  await page.getByRole('button', { name: 'Export preset' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByText('Import preset').locator('input[type=file]')).toBeFocused();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await chooser;
});

test('the save dialog suggests the name of the slot it saves to, every time it opens', async ({ page, pedal }) => {
  await connect(page, pedal);
  await pickAmp(page, 'Calif DualM');
  await page.getByRole('button', { name: 'Save…' }).click();
  const save = page.getByRole('dialog', { name: 'Save to a preset slot' });
  await expect(save.getByLabel('Name')).toHaveValue('IRON-LEAD');
  await save.getByLabel('Name').fill('E2E RECT');
  await save.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: /Load P10/ }).click();
  await page.getByRole('button', { name: 'Discard and load' }).click();
  await expect(page.getByRole('heading', { name: /P10\s*THR-CLEAN/ })).toBeVisible();
  await pickAmp(page, 'Calif DualM');
  await page.getByRole('button', { name: 'Save…' }).click();
  await expect(save.getByLabel('Name')).toHaveValue('THR-CLEAN');
});

test('after a save the preset is no longer modified: loading another one does not ask', async ({ page, pedal }) => {
  await connect(page, pedal);
  await pickAmp(page, 'Calif DualM');
  await page.getByRole('button', { name: 'Read' }).click(); // the pedal now says "modified" too
  await page.getByRole('button', { name: 'Save…' }).click();
  const save = page.getByRole('dialog', { name: 'Save to a preset slot' });
  await save.getByRole('button', { name: 'Save to P09' }).click();
  await save.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Revert' })).toBeDisabled();
  await page.getByRole('button', { name: /Load P10/ }).click();
  await expect(page.getByRole('heading', { name: /P10\s*THR-CLEAN/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Discard the changes?' })).toBeHidden();
});

test('an exported preset goes into the library, and loads from there with its comparison', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Library');
  const library = page.getByRole('region', { name: 'Preset library' });
  await expect(library.getByText(/Presets you export or import/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export preset' }).click();
  await download;
  await expect(library.getByText('IRON-LEAD')).toBeVisible();

  await pickAmp(page, 'Calif DualM');
  await library.getByRole('button', { name: 'Load IRON-LEAD' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a preset' });
  await expect(dialog.getByRole('listitem').filter({ hasText: 'AMP Model' })).toContainText('Calif DualM → Brit 800');
  await dialog.getByRole('button', { name: 'Load into the pedal' }).click();
  await expect(dialog.getByText(/is loaded into the edit buffer/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(amp(page).getByText('Brit 800')).toBeVisible();

  await library.getByRole('button', { name: 'Remove IRON-LEAD from the library' }).click();
  await expect(library.getByText('IRON-LEAD')).toBeHidden();
});

test('the firmware version shows in Global options, and a different one gets a notice', async ({ page, pedal }) => {
  await connect(page, pedal);
  await expect(page.getByText(/the editor was tested on/)).toBeHidden();
  await page.getByRole('button', { name: 'Global options' }).click();
  await expect(page.getByRole('region', { name: 'Global options' }).getByText('V1.3.3')).toBeVisible();
  await page.keyboard.press('Escape');

  pedal.globals = Uint8Array.from(pedal.globals.map((b, i) => (i === 6 ? 0 : i === 7 ? 4 : b))); // 00 04 01 01: V1.4.0
  // Unplugged and plugged back in: read again from scratch.
  await page.evaluate(() => window.__midi.unplug('Pocket Master'));
  await page.evaluate(() => window.__midi.plug('Pocket Master'));
  await expect(page.getByText('This pedal reports firmware V1.4.0; the editor was tested on V1.3.3.', { exact: false })).toBeVisible();
});

test('a preset is copied over another slot without loading either, checked on the pedal', async ({ page, pedal }) => {
  await connect(page, pedal);
  const loaded = Array.from(pedal.pedal.editBuffer);
  await page.getByRole('button', { name: 'Copy…' }).click();
  const copy = page.getByRole('dialog', { name: 'Copy a preset' });
  await expect(copy.getByLabel('Copy')).toHaveValue('8');
  await copy.getByLabel('Over').selectOption('11');
  await copy.getByRole('button', { name: 'Copy to P12' }).click();
  await expect(copy.getByText('P12 now holds P09 “IRON-LEAD”, checked on the pedal.')).toBeVisible();
  expect(Array.from(pedal.pedal.slots[11]!)).toEqual(Array.from(pedal.pedal.slots[8]!));
  expect(pedal.pedal.names[11]).toBe('IRON-LEAD');
  expect(Array.from(pedal.pedal.editBuffer)).toEqual(loaded);
  await copy.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: /P09\s*IRON-LEAD/ })).toBeVisible();
});

test("the tuner button turns the pedal's tuner on and off", async ({ page, pedal }) => {
  await connect(page, pedal);
  const tuner = page.getByRole('button', { name: 'Tuner' });
  await tuner.click();
  await expect(tuner).toHaveAttribute('aria-pressed', 'true');
  await tuner.click();
  await expect(tuner).toHaveAttribute('aria-pressed', 'false');
  expect(pedal.controls).toEqual(['B0 3A 7F', 'B0 3A 00']);
});

test('a preset file picked in Backups opens as a preset import, and a wrong file says why in the panel', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Backups');
  const backups = page.getByRole('region', { name: 'Backups' });
  await backups.locator('input[type=file]').setInputFiles(new URL('../../../packages/core/test/fixtures/preset-files/v1-iron-lead.json', import.meta.url).pathname);
  await expect(page.getByRole('dialog', { name: 'Import a preset' })).toBeVisible();
  await expect(backups.getByText(/“IRON-LEAD” is a preset file, not a backup/)).toBeVisible();
  await page.getByRole('dialog', { name: 'Import a preset' }).getByRole('button', { name: 'Cancel' }).click();
  await backups.locator('input[type=file]').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(backups.getByRole('alert')).toContainText('not a Pocket Master backup');
  await backups.locator('input[type=file]').setInputFiles(prst('SONIC-LEAD'));
  await expect(page.getByRole('dialog', { name: 'Import a preset' })).toBeVisible();
  await expect(backups.getByText(/“SONIC-LEAD” is a preset file, not a backup/)).toBeVisible();
});

test('back up all presets to a file, then restore them all', async ({ page, pedal }) => {
  test.setTimeout(120_000);
  await connect(page, pedal);
  await openDock(page, 'Backups');
  const originals = pedal.pedal.slots.slice(0, 50).map((s) => Array.from(s));
  const backups = page.getByRole('region', { name: 'Backups' });
  const download = page.waitForEvent('download');
  await backups.getByRole('button', { name: 'Back up all presets' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await expect(backups.getByText('All user presets')).toBeVisible();
  expect(pedal.pedal.received.filter((r) => r.startsWith('select'))).toHaveLength(0);

  // Two slots change on the pedal; restoring all puts them back.
  pedal.pedal.slots[3] = pedal.pedal.slots[10]!.slice();
  pedal.pedal.names[3] = 'CHANGED';
  pedal.pedal.slots[40] = pedal.pedal.slots[11]!.slice();
  await backups.getByText('All user presets').click();
  await backups.getByRole('button', { name: 'Restore all' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore all 50 presets' });
  await dialog.getByRole('button', { name: 'Restore all' }).click();
  await expect(dialog.getByText('50 presets restored, each checked on the pedal.')).toBeVisible({ timeout: 100_000 });
  pedal.pedal.slots.slice(0, 50).forEach((s, i) => expect(Array.from(s), `P${i + 1}`).toEqual(originals[i]));
  expect(pedal.pedal.names[3]).not.toBe('CHANGED');
  expect(pedal.pedal.current).toBe(8);
});

test('importing a backup file says what it holds and opens it, ready to restore', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Backups');
  const backups = page.getByRole('region', { name: 'Backups' });
  const download = page.waitForEvent('download');
  await backups.getByRole('button', { name: 'Back up all presets' }).click();
  const path = await (await download).path();
  await backups.locator('input[type=file]').setInputFiles(path!);
  await expect(backups.getByText(/Backup imported: All user presets \(50 slots/)).toBeVisible();
  await expect(backups.getByRole('button', { name: 'Restore all' })).toBeVisible();
});

test('restoring all shows one progress bar with its percentage while it works', async ({ page, pedal }) => {
  test.setTimeout(120_000);
  await connect(page, pedal);
  await openDock(page, 'Backups');
  const backups = page.getByRole('region', { name: 'Backups' });
  await backups.getByRole('button', { name: 'Back up all presets' }).click();
  await backups.getByText('All user presets').click();
  await backups.getByRole('button', { name: 'Restore all' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore all 50 presets' });
  await dialog.getByRole('button', { name: 'Restore all' }).click();
  await expect(dialog.getByRole('progressbar')).toBeVisible();
  await expect(dialog.getByText(/Restoring P\d\d… \d+%/)).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByText('Keep the pedal connected and this window open.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('50 presets restored, each checked on the pedal.')).toBeVisible({ timeout: 100_000 });
});

test('a backup card shows its actions at once; one preset restores from its list, with no backup of its own', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Backups');
  const backups = page.getByRole('region', { name: 'Backups' });
  await backups.getByRole('button', { name: 'Back up all presets' }).click();
  await expect(backups.getByRole('button', { name: 'Restore all' })).toBeVisible();
  await expect(backups.getByRole('button', { name: 'Restore to P04' })).toBeHidden();
  const original = Array.from(pedal.pedal.slots[3]!);
  pedal.pedal.slots[3] = pedal.pedal.slots[10]!.slice();
  await backups.getByText('Show the 50 presets').click();
  await backups.getByRole('button', { name: 'Restore to P04' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore P04' });
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(dialog.getByText(/P04 is back to/)).toBeVisible();
  expect(Array.from(pedal.pedal.slots[3]!)).toEqual(original);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(backups.locator('.backup')).toHaveCount(1);
});

test('a capture or IR slot can be deleted, after a confirmation', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Clones & IRs');
  const slots = page.getByRole('region', { name: 'Pedal slots' });
  const irs = slots.locator('li', { hasText: 'Brutal Pri' });
  await irs.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete “Brutal Pri”?' });
  await expect(dialog.getByText(/switch it off and on and try again/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(slots.getByText('Brutal Pri')).toBeHidden();
  expect(pedal.irNames[1]).toBe('');
  await slots.locator('li', { hasText: 'Randall SA' }).getByRole('button', { name: 'Delete' }).click();
  const second = page.getByRole('dialog', { name: 'Delete “Randall SA”?' });
  await second.getByRole('button', { name: 'Delete' }).click();
  await expect(second).toBeHidden();
  await expect(slots.getByText('Randall SA')).toBeHidden();
  expect(pedal.profileNames[0]).toBe('');
});

test('a backup can be deleted from the list, after a confirmation', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Backups');
  const backups = page.getByRole('region', { name: 'Backups' });
  await backups.getByRole('button', { name: 'Back up all presets' }).click();
  await expect(backups.locator('.backup')).toHaveCount(1);
  await backups.locator('.backup').getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this backup?' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(backups.locator('.backup')).toHaveCount(1);
  await backups.locator('.backup').getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(backups.locator('.backup')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Backups' }).locator('.backup')).toHaveCount(0);
});

test('file pickers carry an empty title, so Chrome shows no "No file chosen" tip over the dialogs they open', async ({ page, pedal }) => {
  await connect(page, pedal);
  const inputs = page.locator('input[type="file"]');
  await expect(inputs).not.toHaveCount(0);
  for (const input of await inputs.all()) await expect(input).toHaveAttribute('title', '');
});
