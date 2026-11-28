import { readFileSync } from 'node:fs';
import { parseMatriboxPrst, parseMbPreset, toHex, writeMatriboxPrst } from '@pocket-master/core';
import { blockPanel, connectMatribox, expect, MODELS, test, turnKnob, openDock } from './matribox-fixtures.ts';

const loaded = (unit: { editBuffer: Uint8Array }) => parseMbPreset(unit.editBuffer);
const KEPT = [2, 3, 4, 5, 7, 9];
const kept = (data: Uint8Array) =>
  parseMbPreset(data)
    .sections.filter((s) => KEPT.includes(s.id))
    .map((s) => toHex(s.body));
/** The simulated unit's own preset as a .prst (never a commercial one). */
const prst = (unit: { editBuffer: Uint8Array }, name = 'drive.prst') => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(writeMatriboxPrst(loaded(unit))) });
const PICK = 'Choose a Matribox preset file (.prst)';
const BACKUPS = 'pocket-master-editor.matribox-backups.v1';

test('export downloads the loaded preset, unsaved edits included, as a .prst that parses back', async ({ page, unit }) => {
  await connectMatribox(page);
  const drive = await blockPanel(page, 2, 'DRV');
  await turnKnob(drive.getByRole('slider', { name: 'Gain' }), 16);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export preset' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('17C Drive AD.prst');
  const preset = parseMatriboxPrst(readFileSync(await file.path(), 'utf8'));
  expect(preset.name).toBe('Drive AD');
  expect(preset.chain[1]!.values[0]).toBe(16);
  expect(preset.sections.filter((s) => KEPT.includes(s.id)).map((s) => toHex(s.body))).toEqual(kept(unit.editBuffer));
  expect(unit.current).toBe(66); // nothing was selected or stored
  expect(unit.presetWrites).toHaveLength(0);
});

test('import shows what the file holds, needs a confirmation, backs the target up, stores it and leaves it loaded', async ({ page, unit }) => {
  await connectMatribox(page);
  await page.getByLabel(PICK).setInputFiles(prst(unit));
  const dialog = page.getByRole('dialog', { name: 'Import a preset file' });
  await expect(dialog.getByText('“Drive AD” from drive.prst')).toBeVisible();
  await expect(
    dialog.getByText(`Chain: DYN ${MODELS.gate.name} → DRV ${MODELS.drive.name} → AMP ${MODELS.amp.name} → CAB ${MODELS.cab.name} → RVB ${MODELS.hall.name} → VOL ${MODELS.volume.name}`),
  ).toBeVisible();
  const slot = dialog.getByRole('combobox', { name: 'Slot' });
  await expect(slot).toHaveValue('66'); // the loaded slot by default
  await slot.selectOption({ index: 5 });
  const submit = dialog.getByRole('button', { name: 'Import into 2B' });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /Replace 2B .* at once/ }).check();
  await submit.click();
  await expect(dialog.getByText('Imported into 2B as “Drive AD” and checked on the Matribox.')).toBeVisible();
  expect(unit.presetWrites).toHaveLength(1);
  expect(kept(unit.stored(5)!)).toEqual(kept(unit.stored(66)!));
  expect(unit.current).toBe(5);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: '2B Drive AD' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Load 2B “Drive AD”/ })).toBeVisible();
  const backups = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), BACKUPS);
  // What 2B stored (empty here), read with 2B loaded.
  expect(backups.map((b: { label: string; name: string; source: string }) => [b.label, b.name, b.source])).toEqual([['2B', '', 'slot']]);
  await openDock(page, 'Backups');
  await expect(page.getByRole('region', { name: 'Matribox backups' })).toContainText('2B');
});

test('import takes a backup of one slot too, and says that unsaved edits are lost', async ({ page, unit }) => {
  await connectMatribox(page);
  await page.getByRole('list', { name: 'Signal chain' }).getByRole('switch', { name: '2. DRV off' }).click();
  await expect.poll(() => loaded(unit).chain[1]!.on).toBe(true);
  const backup = { device: 'Sonicake Matribox II Pro', label: '17C', index: 66, name: 'Drive AD', createdAt: '2026-11-24T12:00:00.000Z', source: 'slot', preset: toHex(unit.stored(66)!) };
  await page.getByLabel(PICK).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  const dialog = page.getByRole('dialog', { name: 'Import a preset file' });
  await expect(dialog.getByText('Unsaved edits of 17C are lost')).toBeVisible();
  await dialog.getByRole('checkbox', { name: /Replace 17C/ }).check();
  await dialog.getByRole('button', { name: 'Import into 17C' }).click();
  await expect(dialog.getByText('Imported into 17C')).toBeVisible();
  expect(loaded(unit).chain[1]!.on).toBe(false); // the file's preset, not the edit
});

test('import refuses a file that is not a Matribox preset, and names a Pocket Master .prst', async ({ page, unit }) => {
  await connectMatribox(page);
  const dialog = page.getByRole('dialog', { name: 'Import a preset file' });
  await page.getByLabel(PICK).setInputFiles({ name: 'notes.prst', mimeType: 'application/octet-stream', buffer: Buffer.from('not a preset') });
  await expect(dialog.getByRole('alert')).toHaveText('notes.prst: This is not a Matribox II Pro preset file (.prst).');
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Done' }).click();
  const pocket = Buffer.alloc(515);
  pocket.write('Pocket Master');
  await page.getByLabel(PICK).setInputFiles({ name: 'P01.prst', mimeType: 'application/octet-stream', buffer: pocket });
  await expect(dialog.getByRole('alert')).toContainText('This is a Pocket Master .prst file, a different format');
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  expect(unit.presetWrites).toHaveLength(0);
});

test('cancelling an import sends nothing to the unit', async ({ page, unit }) => {
  await connectMatribox(page);
  await page.getByLabel(PICK).setInputFiles(prst(unit));
  const dialog = page.getByRole('dialog', { name: 'Import a preset file' });
  await dialog.getByRole('combobox', { name: 'Slot' }).selectOption({ index: 5 });
  await dialog.getByRole('checkbox', { name: /Replace 2B/ }).check();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(unit.current).toBe(66); // 2B was not even loaded
  expect(unit.presetWrites).toHaveLength(0);
  expect(unit.stored(5)).toBeUndefined();
  expect(await page.evaluate((key) => localStorage.getItem(key), BACKUPS)).toBeNull();
});

test('import is a button the keyboard reaches, and Enter or Space opens the file picker', async ({ page, unit }) => {
  await connectMatribox(page);
  const exportButton = page.getByRole('button', { name: 'Export preset' });
  await expect(exportButton).toBeEnabled(); // the editor is idle
  await exportButton.focus();
  await page.keyboard.press('Tab');
  const button = page.getByRole('button', { name: 'Import preset…' });
  await expect(button).toBeFocused();
  const dialog = page.getByRole('dialog', { name: 'Import a preset file' });
  for (const key of ['Enter', 'Space']) {
    await button.focus();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press(key);
    await (await chooser).setFiles(prst(unit));
    await expect(dialog.getByText('“Drive AD” from drive.prst')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  }
  expect(unit.presetWrites).toHaveLength(0);
});
