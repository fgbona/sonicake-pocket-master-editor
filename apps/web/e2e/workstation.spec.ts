/**
 * The workstation look (docs/design/workstation-ui.md): knob drag, wheel, typing and reset, and the
 * edited (dirty) and sync states, against the simulated Matribox and Pocket Master; no hardware.
 */
import type { Page } from '@playwright/test';
import { parseMbPreset } from '@pocket-master/core';
import { blockPanel, connectMatribox, expect, test } from './matribox-fixtures.ts';
import { connect, test as pmTest, expect as pmExpect } from './fixtures.ts';

const ampGain = (page: Page) => page.getByRole('region', { name: '3. AMP block' }).getByRole('slider', { name: 'Gain' });
/** The edit buffer's AMP (3rd block) gain and the stored one of the loaded slot. */
const bufferGain = (unit: { editBuffer: Uint8Array }) => parseMbPreset(unit.editBuffer).chain[2]!.values[0];
const storedGain = (unit: { current: number; stored(i: number): Uint8Array | undefined }) => parseMbPreset(unit.stored(unit.current)!).chain[2]!.values[0];
const sync = (page: Page) => page.locator('.ws-sync');

test('a knob turns by vertical drag and by the wheel, and the unit follows', async ({ page, unit }) => {
  await connectMatribox(page);
  const gain = ampGain(page);
  await expect(gain).toHaveAttribute('aria-valuenow', '30');
  // A knob ignores the pointer while the editor is busy (the connect reads).
  await expect(gain).toHaveAttribute('aria-disabled', 'false');
  await gain.scrollIntoViewIfNeeded();
  const box = (await gain.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // 220 px is the whole range (0..100): 44 px up is +20.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 22, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 44, { steps: 4 });
  await page.mouse.up();
  await expect(gain).toHaveAttribute('aria-valuenow', '50');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await page.mouse.wheel(0, -100);
  await expect(gain).toHaveAttribute('aria-valuenow', '51');
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await expect(gain).toHaveAttribute('aria-valuenow', '49');
  await expect.poll(() => bufferGain(unit)).toBe(49);
});

test('a knob takes a typed value, Escape cancels, and a double-click resets the default', async ({ page, unit }) => {
  await connectMatribox(page);
  const amp = page.getByRole('region', { name: '3. AMP block' });
  const gain = ampGain(page);

  await amp.getByRole('button', { name: 'Type a value for “Gain”' }).click();
  const field = amp.getByRole('textbox', { name: 'Gain value' });
  await expect(field).toBeFocused();
  await field.fill('72');
  await field.press('Enter');
  await expect(gain).toHaveAttribute('aria-valuenow', '72');
  await expect.poll(() => bufferGain(unit)).toBe(72);

  // Out of range is clamped; a value with a unit still reads as its number.
  await amp.getByRole('button', { name: 'Type a value for “Gain”' }).click();
  await amp.getByRole('textbox', { name: 'Gain value' }).fill('140 %');
  await amp.getByRole('textbox', { name: 'Gain value' }).press('Enter');
  await expect(gain).toHaveAttribute('aria-valuenow', '100');

  await amp.getByRole('button', { name: 'Type a value for “Gain”' }).click();
  await amp.getByRole('textbox', { name: 'Gain value' }).fill('5');
  await amp.getByRole('textbox', { name: 'Gain value' }).press('Escape');
  await expect(amp.getByRole('textbox', { name: 'Gain value' })).toHaveCount(0);
  await expect(gain).toHaveAttribute('aria-valuenow', '100');

  // Enter on the focused knob opens the field too.
  await gain.focus();
  await gain.press('Enter');
  await expect(amp.getByRole('textbox', { name: 'Gain value' })).toBeFocused();
  await amp.getByRole('textbox', { name: 'Gain value' }).press('Escape');

  await gain.dblclick();
  await expect(gain).toHaveAttribute('aria-valuenow', '30'); // the catalog's default
  await expect.poll(() => bufferGain(unit)).toBe(30);
});

test('an edit marks the preset and the block as not stored; saving brings them back in sync', async ({ page, unit }) => {
  await connectMatribox(page);
  const chain = page.getByRole('list', { name: 'Signal chain' });
  const edited = chain.getByRole('img', { name: 'Edited, not stored' });
  await expect(sync(page)).toHaveText('In sync with the pedal');
  await expect(edited).toHaveCount(0);

  const drive = await blockPanel(page, 2, 'DRV');
  await drive.getByRole('slider', { name: 'Gain' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(sync(page)).toHaveText('Edited · not stored in 17C');
  await expect(sync(page)).toHaveAttribute('data-sync', 'dirty');
  await expect(edited).toHaveCount(1);
  await expect(chain.locator('.tile-dirty')).toHaveClass(/mb-drv/);
  // The loaded preset in the list shows it too.
  await expect(page.locator('.sidebar-item.is-current .ws-dirty-dot')).toBeVisible();

  await page.getByRole('button', { name: 'Save…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save to the Matribox' });
  await dialog.getByRole('checkbox', { name: /Replace 17C/ }).check();
  await dialog.getByRole('button', { name: 'Save to 17C' }).click();
  await expect(dialog.getByText(/Saved to 17C/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(sync(page)).toHaveText('In sync with the pedal');
  await expect(edited).toHaveCount(0);
  expect(storedGain(unit)).toBe(30); // the AMP was not touched
});

test('the save dialog names a preset by its bank role', async ({ page }) => {
  await connectMatribox(page);
  await page.getByRole('button', { name: 'Save…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save to the Matribox' });
  const name = dialog.getByRole('textbox', { name: 'Name' });
  await name.fill('MTL');
  await dialog.getByRole('button', { name: 'Set as the RHY preset of the bank' }).click();
  await expect(name).toHaveValue('MTL-RHY');
  await dialog.getByRole('button', { name: 'Set as the LEAD preset of the bank' }).click();
  await expect(name).toHaveValue('MTL-LEAD');
  await expect(dialog.getByRole('button', { name: 'Set as the LEAD preset of the bank' })).toHaveAttribute('aria-pressed', 'true');
});

test('the shell fills a 1440×900 screen: no page scroll, the bank list and the panels scroll inside', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await connectMatribox(page);
  const page_ = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, view: window.innerHeight, width: document.documentElement.scrollWidth, wide: window.innerWidth }));
  expect(page_.height).toBeLessThanOrEqual(page_.view);
  expect(page_.width).toBeLessThanOrEqual(page_.wide);
  await page.mouse.move(140, 500);
  await page.mouse.wheel(0, 2000);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const list = page.locator('.sidebar-list');
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // The chain, the selected block and the dock's tabs are all on screen at once.
  await expect(page.getByRole('list', { name: 'Signal chain' })).toBeInViewport();
  await expect(page.getByRole('region', { name: '3. AMP block' })).toBeInViewport();
  await expect(page.getByRole('tablist', { name: 'Workstation dock' })).toBeInViewport();
  // Opening the dock still keeps the page itself from scrolling.
  await page.getByRole('tab', { name: 'AI Assistant' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test('the dock has real tabs: one panel at a time, arrow keys move, the open tab folds it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await connectMatribox(page);
  const tabs = page.getByRole('tablist', { name: 'Workstation dock' });
  await expect(tabs.getByRole('tab')).toHaveText(['Assistant', 'Clones & IRs', 'Controls', 'Library', 'Backups', 'Global & EQ']);
  // Folded at first: the chain and the block get the room.
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Clones & IRs' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Clones & IRs' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Clones' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'User IRs' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tone assistant' })).toBeHidden();

  await tabs.getByRole('tab', { name: 'Clones & IRs' }).press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Controls' })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Controls' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Clones' })).toBeHidden();
  await expect(page.getByRole('tabpanel', { name: 'Controls' }).getByText('Footswitch A', { exact: true }).first()).toBeVisible();

  await tabs.getByRole('tab', { name: 'Global & EQ' }).click();
  // Global options are this tab, not a dialog: the settings and the EQ graph are right there.
  await expect(page.getByRole('region', { name: 'Global options' }).getByRole('img', { name: 'Global EQ response' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The preset bar's Global options button opens the same tab.
  await tabs.getByRole('tab', { name: 'AI Assistant' }).click();
  await page.getByRole('button', { name: 'Global options', exact: true }).click();
  await expect(tabs.getByRole('tab', { name: 'Global & EQ' })).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('tab', { name: 'Global & EQ' }).click();
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open the dock' }).click();
  await expect(page.getByRole('tabpanel', { name: 'AI Assistant' })).toBeVisible();
});

test('below 1280 px the dock stacks: no tabs, every panel on the page', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await connectMatribox(page);
  await expect(page.getByRole('tablist', { name: 'Workstation dock' })).toBeHidden();
  for (const region of ['Tone assistant', 'Clones', 'User IRs', 'Tone library', 'All presets']) await expect(page.getByRole('region', { name: region })).toBeAttached();
  await page.getByRole('region', { name: 'Clones' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('region', { name: 'Clones' })).toBeInViewport();
});

test('a knob whose value differs from the unit gets its own edited dot, gone once it is back', async ({ page }) => {
  await connectMatribox(page);
  const amp = page.getByRole('region', { name: '3. AMP block' });
  const knob = (name: string) => amp.locator('.knob').filter({ has: page.getByRole('slider', { name }) });
  const mark = (name: string) => knob(name).getByRole('img', { name: 'Edited, not stored' });
  await expect(mark('Gain')).toHaveCount(0);
  await amp.getByRole('button', { name: 'Type a value for “Gain”' }).click();
  await amp.getByRole('textbox', { name: 'Gain value' }).fill('64');
  await amp.getByRole('textbox', { name: 'Gain value' }).press('Enter');
  await expect(mark('Gain')).toHaveCount(1);
  await expect(mark('Presence')).toHaveCount(0);
  // Back to what the unit stores: no longer edited, though the preset as a whole still says so.
  await amp.getByRole('slider', { name: 'Gain' }).dblclick();
  await expect(ampGain(page)).toHaveAttribute('aria-valuenow', '30');
  await expect(mark('Gain')).toHaveCount(0);
});

pmTest('Pocket Master: a typed value and the edited state', async ({ page, pedal }) => {
  await connect(page, pedal);
  const amp = page.locator('section.block-amp');
  await pmExpect(sync(page)).toHaveText('In sync with the pedal');
  const gain = amp.getByRole('slider', { name: /gain/i });
  const before = Number(await gain.getAttribute('aria-valuenow'));
  const typed = String(before >= 50 ? before - 5 : before + 5);
  await amp.getByRole('button', { name: /^Type a value for “gain”/i }).click();
  await amp.getByRole('textbox', { name: /gain value/i }).fill(typed);
  await amp.getByRole('textbox', { name: /gain value/i }).press('Enter');
  await pmExpect(gain).toHaveAttribute('aria-valuenow', typed);
  await pmExpect(sync(page)).toHaveText('Edited · not stored in P09');
  await pmExpect(page.getByRole('list', { name: 'Signal chain' }).getByRole('img', { name: 'Edited, not stored' })).toHaveCount(1);
});
