import { readFileSync } from 'node:fs';
import { parseMbPreset, toHex } from '@pocket-master/core';
import { blockPanel, connectMatribox, expect, test, turnKnob, openDock } from './matribox-fixtures.ts';

const gain = (unit: { editBuffer: Uint8Array }) => parseMbPreset(unit.editBuffer).chain[1]!.values[0];
const KEY = 'pocket-master-editor.matriboxLibrary.v1';
const POCKET_KEY = 'pocket-master-editor.presetLibrary.v1';

test('keep the sound, change it, load the kept tone back into the edit buffer, and Undo returns the change; no slot is written', async ({ page, unit }) => {
  await connectMatribox(page);
  await openDock(page, 'Library');
  const stored = toHex(unit.stored(66)!);
  const library = page.getByRole('region', { name: 'Tone library' });
  await expect(library.getByText('No tones kept yet')).toBeVisible();
  const drive = await blockPanel(page, 2, 'DRV');
  await turnKnob(drive.getByRole('slider', { name: 'Gain' }), 30);
  await expect.poll(() => gain(unit)).toBe(30);

  await library.getByRole('textbox', { name: 'Name' }).fill('Crunch');
  await library.getByRole('textbox', { name: 'Notes' }).fill('AC/DC, rhythm');
  await library.getByRole('button', { name: 'Keep tone' }).click();
  await expect(library.getByRole('status')).toHaveText('Kept “Crunch” in the tone library.');
  await expect(library.getByRole('listitem')).toHaveCount(1);
  await expect(library.getByRole('listitem')).toContainText('Crunch · AC/DC, rhythm');

  await turnKnob(drive.getByRole('slider', { name: 'Gain' }), 75);
  await expect.poll(() => gain(unit)).toBe(75);
  await library.getByRole('button', { name: 'Load Crunch into the loaded preset' }).click();
  await expect(library.getByRole('status')).toContainText('Loaded “Crunch”');
  await expect.poll(() => gain(unit)).toBe(30);
  await expect(drive.getByRole('slider', { name: 'Gain' })).toHaveAttribute('aria-valuenow', '30');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => gain(unit)).toBe(75);
  await expect(drive.getByRole('slider', { name: 'Gain' })).toHaveAttribute('aria-valuenow', '75');

  expect(unit.current).toBe(66);
  expect(unit.presetWrites).toHaveLength(0);
  expect(toHex(unit.stored(66)!)).toBe(stored);
  const kept = await page.evaluate(([k, p]) => [JSON.parse(localStorage.getItem(k!) ?? '[]'), localStorage.getItem(p!)], [KEY, POCKET_KEY]);
  expect(kept[0].map((t: { name: string; notes: string }) => [t.name, t.notes])).toEqual([['Crunch', 'AC/DC, rhythm']]);
  expect(kept[1]).toBeNull(); // the Pocket Master's library is left alone
});

test('rename, delete, export and import the tone library; the kept tones survive a reload', async ({ page }) => {
  await connectMatribox(page);
  await openDock(page, 'Library');
  const library = page.getByRole('region', { name: 'Tone library' });
  await library.getByRole('button', { name: 'Keep tone' }).click();
  await expect(library.getByRole('listitem')).toContainText('Drive AD'); // the loaded preset's name by default
  await expect(library.getByRole('button', { name: /^Load / })).toBeEnabled(); // the catalog is built in

  await library.getByRole('button', { name: 'Rename Drive AD' }).click();
  await library.getByRole('textbox', { name: 'New name for Drive AD' }).fill('Lead');
  await library.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(library.getByRole('listitem')).toContainText('Lead');

  const download = page.waitForEvent('download');
  await library.getByRole('button', { name: 'Export library' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('matribox-library.json');
  const text = readFileSync(await file.path(), 'utf8');
  expect(JSON.parse(text).tones.map((t: { name: string }) => t.name)).toEqual(['Lead']);

  await library.getByRole('button', { name: 'Delete Lead from the tone library' }).click();
  await expect(library.getByText('No tones kept yet')).toBeVisible();
  const pick = page.getByLabel('Choose a Matribox tone library file (.json)');
  await pick.setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"pocket-master-backup"}') });
  await expect(library.getByRole('alert')).toHaveText('notes.json is not a Matribox tone library file.');
  await pick.setInputFiles({ name: 'tones.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(library.getByRole('status')).toHaveText('Tones added from tones.json: 1.');
  await expect(library.getByRole('listitem')).toContainText('Lead');

  await page.reload();
  await expect(page.getByRole('region', { name: 'Tone library' }).getByRole('listitem')).toContainText('Lead');
});
