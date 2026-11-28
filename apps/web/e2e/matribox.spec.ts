import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { MB_CATALOG, mbAssignments, parseMbPreset, toHex } from '@pocket-master/core';
import { measure } from './contrast.ts';
import { blockPanel, connectMatribox, expect, expectChain, MODELS, optionName, settled, test, turnKnob, openDock } from './matribox-fixtures.ts';

const loaded = (unit: { editBuffer: Uint8Array }) => parseMbPreset(unit.editBuffer);

test('a Matribox is recognised by its port and gets its own editor, its models built in', async ({ page }) => {
  await connectMatribox(page);
  // None of the Pocket Master's tools.
  await expect(page.getByRole('button', { name: 'Tuner' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Load 60D/ })).toBeAttached();
  await expectChain(page, 'DYN → DRV → AMP → CAB → RVB → VOL');
  await expect(page.locator('.tile.mb-drv')).toContainText(MODELS.drive.name);
  // Every block of the preset is named: no raw values, and every parameter is a control.
  await expect(page.locator('.mb-raw')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '3. AMP block' }).getByRole('slider', { name: 'Gain' })).toBeVisible();
});

for (const [locale, lang, basedOn] of [
  ['en-US', 'en', 'Based on'],
  ['pt-BR', 'pt', 'Baseado em'],
] as const) {
  test.describe(locale, () => {
    test.use({ locale });
    test('the catalog is built in: no file to choose and no alg_data anywhere in the Matribox UI', async ({ page }) => {
      await connectMatribox(page);
      // The file pickers left are for presets, backups and kept tones: none for a catalog.
      await expect(page.getByLabel(/alg_data|catalog|catálogo/i)).toHaveCount(0);
      await expect(page.getByText(/alg_data|Model catalog|Catálogo de modelos/)).toHaveCount(0);
      // The add menu lists every module's models straight away.
      await page.locator('.mb-tile-add').click();
      await page.getByRole('listbox').getByRole('option', { name: 'WAH', exact: true }).click();
      await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1 + (MB_CATALOG.modules.find((m) => m.name === 'WAH')?.models.length ?? 0));
      await page.keyboard.press('Escape');
      expect(await page.content()).not.toMatch(/alg_data/);
      // The selected AMP: our name, "Based on" the gear, and the description in the UI's language.
      const amp = page.locator('section.editor');
      // The header pairs our name with the plain gear, as the menu's two columns do.
      await expect(amp.locator('.picker-button .picker-name')).toHaveText(MODELS.amp.name);
      await expect(amp.locator('.picker-button .picker-detail')).toHaveText(MODELS.amp.basedOn);
      await expect(amp.getByText(`${basedOn} ${MODELS.amp.basedOn}`)).toBeVisible();
      await expect(amp.locator('.editor-info')).toHaveText(MODELS.amp.description[lang]);
      await expect(amp.locator('.editor-info')).not.toHaveText(MODELS.amp.description[lang === 'en' ? 'pt' : 'en']);
    });
  });
}

test('the chain shows as pedals; the AMP is dressed like the gear its model is based on', async ({ page }) => {
  await connectMatribox(page);
  await expectChain(page, 'DYN → DRV → AMP → CAB → RVB → VOL');
  const chain = page.getByRole('list', { name: 'Signal chain' });
  await expect(chain.getByRole('button', { name: `Edit 3. AMP: ${MODELS.amp.name}` })).toHaveAttribute('aria-pressed', 'true');
  await expect(chain.getByRole('switch', { name: '2. DRV off' })).toBeVisible();
  const amp = page.getByRole('region', { name: '3. AMP block' });
  await expect(amp.locator('.face-amp')).toHaveAttribute('data-skin', 'boutique'); // based on a Bogner
  await expect(amp.getByText(`Based on ${MODELS.amp.basedOn}`)).toBeVisible();
  await expect(amp.getByRole('slider', { name: 'Gain' })).toHaveAttribute('aria-valuenow', '30');

  // One panel: the selected block's.
  await expect(page.locator('section.editor')).toHaveCount(1);
  const drive = await blockPanel(page, 2, 'DRV');
  await expect(drive.getByText(`Based on ${MODELS.drive.basedOn} · ${MODELS.drive.description.en}`)).toBeVisible();
  await expect(drive.locator('.face-amp')).toHaveCount(0);
  await expect(page.locator('section.editor')).toHaveCount(1);
});

test('live parameters, on/off, models and chain edits reach the unit', async ({ page, unit }) => {
  await connectMatribox(page);
  const drive = await blockPanel(page, 2, 'DRV');

  // A knob turned key after key: the unit ends on the last value.
  await turnKnob(drive.getByRole('slider', { name: 'Gain' }), 16);
  await expect.poll(() => loaded(unit).chain[1]!.values[0]).toBe(16);

  await drive.getByRole('switch', { name: '2. DRV off' }).click();
  await expect.poll(() => loaded(unit).chain[1]!.on).toBe(true);
  // The tile's LED is the same switch.
  await page.getByRole('list', { name: 'Signal chain' }).getByRole('switch', { name: '2. DRV on' }).click();
  await expect.poll(() => loaded(unit).chain[1]!.on).toBe(false);

  // The block's menu lists only DRV models, under their type headings.
  await drive.getByRole('button', { name: '2. DRV model' }).click();
  const menu = page.getByRole('listbox', { name: '2. DRV model' });
  await expect(menu.getByRole('option')).toHaveCount(24);
  await expect(menu.locator('.picker-heading')).toHaveText(['OD', 'Fuzz', 'Distortion', 'Bass Drive']);
  await expect(menu.getByRole('group', { name: 'Distortion' }).getByRole('option', { name: optionName(MODELS.drive) })).toHaveText(/^✓/); // the chosen one
  await menu
    .getByRole('group', { name: 'OD' })
    .getByRole('option', { name: optionName(MODELS.od) })
    .click();
  await expect(drive.getByRole('button', { name: '2. DRV model' })).toContainText(MODELS.od.name);
  expect(loaded(unit).chain[1]!.fxid).toBe(0x03000010);
  // A module with a single type shows no heading.
  await (await blockPanel(page, 5, 'RVB')).getByRole('button', { name: '5. RVB model' }).click();
  await expect(page.getByRole('listbox', { name: '5. RVB model' }).locator('.picker-heading')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Add: the block type first, then that module's models.
  await page.getByRole('button', { name: 'Add a block…' }).click();
  const types = page.getByRole('listbox', { name: 'Add a block: type' });
  await expect(types.getByRole('option')).toHaveText(MB_CATALOG.modules.map((m) => m.name));
  await expect(types.locator('.mb-pick-icon.mb-dly .module-icon')).toBeVisible();
  await types.getByRole('option', { name: 'DLY' }).click();
  const delays = page.getByRole('listbox', { name: 'Add a block: DLY model' });
  await expect(delays.getByRole('option')).toHaveCount(18);
  await expect(delays.locator('.picker-heading')).toHaveCount(0);
  await delays.getByRole('option', { name: optionName(MODELS.echo) }).click();
  await expectChain(page, 'DYN → DRV → AMP → CAB → RVB → VOL → DLY');
  // The block just added is the one shown; a knob whose range is not 0..100 says it.
  const echo = page.getByRole('region', { name: '7. DLY block' });
  await expect(echo.getByText('20 … 4000')).toBeVisible();

  await page.getByRole('button', { name: 'Move block 7 earlier in the chain' }).click();
  await expectChain(page, 'DYN → DRV → AMP → CAB → RVB → DLY → VOL');

  const dyn = await blockPanel(page, 1, 'DYN');
  await dyn.getByRole('button', { name: 'Remove 1. DYN from the chain' }).click();
  await expectChain(page, 'DRV → AMP → CAB → RVB → DLY → VOL');
  expect(loaded(unit).chain.map((b) => b.moduleIndex)).toEqual([3, 4, 5, 10, 9, 15]);
});

test('the add menu works from the keyboard: arrows, Enter, Escape back a step and out', async ({ page, unit }) => {
  await connectMatribox(page);
  const add = page.getByRole('button', { name: 'Add a block…' });
  await expect(add).toBeEnabled(); // not while the editor is still reading
  await add.focus();
  await page.keyboard.press('Enter');
  const types = page.getByRole('listbox', { name: 'Add a block: type' });
  await expect(types).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown'); // DYN, FREQ, WAH, DRV
  await expect(types.getByRole('option', { name: 'DRV' })).toHaveClass(/is-active/);
  await page.keyboard.press('Enter');
  const drives = page.getByRole('listbox', { name: 'Add a block: DRV model' });
  await expect(drives).toBeFocused();
  await expect(drives.locator('.picker-heading')).toHaveText(['OD', 'Fuzz', 'Distortion', 'Bass Drive']);
  // Escape returns to the types, a second Escape closes the menu on the Add tile.
  await page.keyboard.press('Escape');
  await expect(types).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(types).toHaveCount(0);
  await expect(add).toBeFocused();

  await page.keyboard.press('Enter');
  await page.keyboard.press('d'); // DYN
  await page.keyboard.press('d'); // DRV
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  const last = MB_CATALOG.modules[3]!.models.at(-1)!;
  await expect(drives.getByRole('option', { name: optionName(last) })).toHaveClass(/is-active/);
  await page.keyboard.press('Enter');
  await expectChain(page, 'DYN → DRV → AMP → CAB → RVB → VOL → DRV');
  expect(loaded(unit).chain.at(-1)).toMatchObject({ moduleIndex: 3, fxid: last.fxid });
});

test('patch volume, footswitch, CTRL, quick knob and expression assignments reach the unit; tuner and tempo go as Control Changes', async ({ page, unit }) => {
  await connectMatribox(page);
  const assigned = () => mbAssignments(loaded(unit));

  await turnKnob(page.getByRole('slider', { name: 'Patch volume' }), 80);
  await expect.poll(() => assigned().volume).toBe(80);

  // The chip follows the unit: it shows the preset read back after the write.
  await openDock(page, 'Controls');
  const footswitches = page.getByRole('region', { name: 'Footswitches and CTRL (stomp mode)' });
  await expect(footswitches.getByRole('group', { name: 'CTRL 1' }).getByRole('switch', { checked: true })).toHaveText(['1DYN']);
  await expect(footswitches.getByRole('group', { name: 'CTRL 1' }).getByText('Footswitch A', { exact: true })).toBeVisible();
  const ctrl3 = footswitches.getByRole('switch', { name: 'CTRL 3 switches 2. DRV' });
  await ctrl3.click();
  await expect(ctrl3).toHaveAttribute('aria-checked', 'true');
  expect(assigned().ctrl[2]).toContain(0);
  await ctrl3.click();
  await expect(ctrl3).toHaveAttribute('aria-checked', 'false');
  expect(assigned().ctrl[2]).not.toContain(0);
  // What a footswitch runs: D from CTRL 4 to tap tempo; CTRL 4 then has no footswitch.
  const fsD = footswitches.getByRole('combobox', { name: 'Function of footswitch D' });
  await expect(fsD).toHaveValue('4');
  await fsD.selectOption({ label: 'Tap tempo' });
  await expect.poll(() => assigned().footswitches[3]?.press).toBe(8);
  await expect(footswitches.getByRole('group', { name: 'CTRL 4' }).getByText('No footswitch')).toBeVisible();

  // Quick knobs: folded away; knob 2 on the DRV's Tone, knob 3 on the tempo.
  const knobs = page.getByRole('region', { name: 'Quick knobs' });
  await knobs.getByText('Quick knobs').click();
  await knobs.getByRole('combobox', { name: 'Target of quick knob 2' }).selectOption({ label: `2. DRV ${MODELS.drive.name}` });
  await knobs.getByRole('combobox', { name: 'Parameter of quick knob 2' }).selectOption({ label: 'Tone' });
  await knobs
    .getByRole('listitem')
    .filter({ has: page.getByRole('combobox', { name: 'Target of quick knob 2' }) })
    .getByRole('button', { name: 'Apply' })
    .click();
  await expect.poll(() => assigned().quickKnobs[1]).toEqual({ knob: 1, target: 0, paramId: 1 });
  await knobs.getByRole('combobox', { name: 'Target of quick knob 3' }).selectOption({ label: 'Tempo (BPM)' });
  await expect(knobs.getByRole('combobox', { name: 'Parameter of quick knob 3' })).toHaveCount(0);
  await knobs
    .getByRole('listitem')
    .filter({ has: page.getByRole('combobox', { name: 'Target of quick knob 3' }) })
    .getByRole('button', { name: 'Apply' })
    .click();
  await expect.poll(() => assigned().quickKnobs[2]?.target).toBe(12);

  // Expression: folded away until asked for; entries in their pedal modes.
  const expression = page.getByRole('region', { name: 'Expression pedal' });
  await expect(expression.getByText('1 of 9 in use')).toBeVisible();
  await expect(expression.getByRole('combobox', { name: 'Block of expression entry 4' })).toBeHidden();
  await expression.getByText('Expression pedal').click();
  await expect(expression.getByRole('group', { name: 'EXP 1 · mode B' }).getByRole('combobox', { name: /^Block of expression entry/ })).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Block of expression entry 4' }).selectOption({ label: `2. DRV ${MODELS.drive.name}` });
  await page.getByRole('combobox', { name: 'Parameter of expression entry 4' }).selectOption({ label: 'Tone' });
  await page.getByRole('spinbutton', { name: 'Minimum of expression entry 4' }).fill('10');
  await page.getByRole('spinbutton', { name: 'Maximum of expression entry 4' }).fill('90');
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('combobox', { name: 'Block of expression entry 4' }) })
    .getByRole('button', { name: 'Apply' })
    .click();
  await expect.poll(() => assigned().expression[3]).toEqual({ entry: 3, slot: 0, paramId: 1, min: 10, max: 90 });

  await page.getByRole('switch', { name: 'Tuner' }).click();
  await page.getByRole('button', { name: 'Tap tempo' }).click();
  await page.getByRole('spinbutton', { name: 'BPM' }).fill('140');
  await page.getByRole('button', { name: 'Set BPM' }).click();
  await expect.poll(() => unit.controls).toEqual(['b03a7f', 'b0467f', 'b04401', 'b0450c']);
});

test('the preset list groups the banks, filters and marks the loaded preset', async ({ page }) => {
  await connectMatribox(page);
  const presets = page.getByRole('complementary', { name: 'Presets' });
  await expect(presets.getByRole('list', { name: 'Bank 17' }).getByRole('button')).toHaveCount(4);
  await expect(presets.getByRole('button', { name: /Load 17C/ })).toHaveAttribute('aria-current', 'true');
  await presets.getByRole('searchbox', { name: 'Filter' }).fill('drive ad');
  await expect(presets.getByRole('list', { name: /^Bank/ })).toHaveCount(1);
  await expect(presets.getByRole('button', { name: /^Load/ })).toHaveText(['17CDrive AD']);
});

test('loading a preset asks first over live edits', async ({ page, unit }) => {
  await connectMatribox(page);
  await page.getByRole('list', { name: 'Signal chain' }).getByRole('switch', { name: '2. DRV off' }).click();
  await page.getByRole('button', { name: /Load 1A/ }).click();
  await page.getByRole('button', { name: 'Discard and load' }).click();
  await expect.poll(() => unit.current).toBe(0);
  await expect(page.getByRole('heading', { name: /^1A/ })).toBeVisible();
});

test('saving needs an explicit confirmation, backs the slot up first and is checked on the unit', async ({ page, unit }) => {
  await connectMatribox(page);
  await page.getByRole('button', { name: 'Save…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save to the Matribox' });
  await dialog.getByRole('combobox', { name: 'Slot' }).selectOption({ index: 5 });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('My Tone');
  const submit = dialog.getByRole('button', { name: 'Save to 2B' });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /Replace 2B/ }).check();
  await submit.click();
  await expect(dialog.getByText('Saved to 2B “My Tone”.')).toBeVisible();
  expect(parseMbPreset(unit.stored(5)!).name).toBe('My Tone');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /Load 2B “My Tone”/ })).toBeAttached();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-master-editor.matribox-backups.v1') ?? '[]'));
  expect(kept.map((b: { label: string }) => b.label)).toEqual(['2B']);
  // What 2B stored (empty here), not the loaded preset: the unit reads only a loaded slot truly.
  expect(kept[0].name).toBe('');
  expect(unit.current).toBe(5);
  await openDock(page, 'Backups');
  await expect(page.getByRole('region', { name: 'Matribox backups' })).toContainText('2B');
});

test('back up all presets: every slot read once loaded, one file downloaded, the loaded preset loaded again', async ({ page, unit }) => {
  test.slow(); // 240 selects and reads: over 20 s on a busy CI runner
  await connectMatribox(page);
  await openDock(page, 'Backups');
  const all = page.getByRole('region', { name: 'All presets' });
  const download = page.waitForEvent('download');
  await all.getByRole('button', { name: 'Back up all presets' }).click();
  const file = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
  expect(file.format).toBe('opensonicx-matribox-backup');
  expect(file.presets).toHaveLength(240);
  expect(file.presets[66].name).toBe('Drive AD');
  expect(file.presets[0].name).toBe('');
  await expect(all.getByText('240 presets backed up and downloaded.')).toBeVisible();
  expect(unit.current).toBe(66);
});

test('restore all asks for an explicit confirmation, backs everything up first and writes each preset', async ({ page, unit }) => {
  test.slow(); // a backup of all 240 presets first: over 20 s on a busy CI runner
  await connectMatribox(page);
  await openDock(page, 'Backups');
  const drive = toHex(unit.editBuffer).replaceAll(' ', '');
  const file = {
    format: 'opensonicx-matribox-backup',
    version: 1,
    device: 'Sonicake Matribox II Pro',
    createdAt: '2026-11-24T12:00:00.000Z',
    presets: [
      { index: 0, label: '1A', name: 'Drive AD', preset: drive },
      { index: 1, label: '1B', name: 'Drive AD', preset: drive },
    ],
  };
  await page.getByLabel('Choose a backup-all file').setInputFiles({ name: 'all.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  const dialog = page.getByRole('dialog', { name: 'Restore 2 presets' });
  await expect(dialog.getByText('This overwrites 2 of the 240 presets on the Matribox')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /First back up all 240 presets/ })).toBeChecked();
  const submit = dialog.getByRole('button', { name: 'Overwrite 2 presets' });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'I understand: overwrite 2 presets' }).check();
  const download = page.waitForEvent('download');
  await submit.click();
  expect(JSON.parse(readFileSync(await (await download).path(), 'utf8')).presets).toHaveLength(240);
  await expect(dialog.getByText('2 presets restored, each checked on the Matribox.')).toBeVisible();
  expect(unit.presetWrites.map((w) => w[0])).toEqual([0, 1]);
  expect(unit.current).toBe(66);
  await expect(page.getByRole('button', { name: /Load 1B “Drive AD”/ })).toBeAttached();
});

test('restore all refuses a file that is not a backup-all file', async ({ page }) => {
  await connectMatribox(page);
  await openDock(page, 'Backups');
  await page.getByLabel('Choose a backup-all file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"pocket-master-backup"}') });
  await expect(page.getByRole('region', { name: 'All presets' }).getByRole('alert')).toContainText('not a Matribox backup-all file');
});

for (const theme of ['dark', 'light'] as const) {
  test(`no WCAG A/AA violations in the Matribox editor (${theme} theme)`, async ({ page, unit }) => {
    test.setTimeout(120_000); // seven axe passes over the whole page
    const violations = async () =>
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    await connectMatribox(page);
    await settled(unit); // the buttons fade back in (opacity) once the connect reads are done
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).click();
    expect(await violations()).toEqual([]);
    await openDock(page, 'Controls');
    await page.getByText('Expression pedal').click();
    expect(await violations()).toEqual([]);
    await openDock(page, 'Library');
    // A kept tone in the tone library, one shown and one being renamed.
    const library = page.getByRole('region', { name: 'Tone library' });
    await library.getByRole('button', { name: 'Keep tone' }).click();
    await library.getByRole('textbox', { name: 'Name' }).fill('Second');
    await library.getByRole('button', { name: 'Keep tone' }).click();
    await expect(library.getByRole('listitem')).toHaveCount(2);
    await library.getByRole('button', { name: 'Rename Second' }).click();
    expect(await violations()).toEqual([]);
    await library.getByRole('button', { name: 'Cancel' }).click();
    // An off block (the DRV): its dimmed knob labels still read at AA.
    const drive = await blockPanel(page, 2, 'DRV');
    await expect(drive.getByRole('switch', { name: '2. DRV off' })).toBeVisible();
    expect(await violations()).toEqual([]);
    // The menus open: a block's model menu (the DRV's two types, so headings), then both steps of the add menu.
    await drive.getByRole('switch', { name: '2. DRV off' }).click();
    await drive.getByRole('button', { name: '2. DRV model' }).click();
    await expect(page.getByRole('listbox', { name: '2. DRV model' })).toBeVisible();
    expect(await violations()).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add a block…' }).click();
    await expect(page.getByRole('listbox', { name: 'Add a block: type' })).toBeVisible();
    expect(await violations()).toEqual([]);
    await page.getByRole('listbox', { name: 'Add a block: type' }).getByRole('option', { name: 'DRV', exact: true }).click();
    await expect(page.getByRole('listbox', { name: 'Add a block: DRV model' })).toBeVisible();
    expect(await violations()).toEqual([]);
  });

  // axe leaves text over gradients and the amp's faceplate unmeasured; those are measured from pixels.
  test(`text over gradients is readable in the Matribox editor (${theme} theme)`, async ({ page, unit }) => {
    test.setTimeout(180_000);
    await connectMatribox(page);
    await settled(unit); // the buttons fade back in (opacity) once the connect reads are done
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).click();
    const failures: string[] = [];
    for (const position of [3, 2]) {
      if (position === 2) await blockPanel(page, 2, 'DRV');
      // The editor's own panels; the preset list is the Pocket Master's, measured by a11y.spec.ts.
      const { incomplete } = await new AxeBuilder({ page }).include('main').withRules(['color-contrast']).analyze();
      for (const node of incomplete.flatMap((v) => v.nodes)) {
        if (/non-text/.test(node.any[0]?.message ?? '')) continue;
        const r = await measure(page, page.locator(node.target.join(' ')).first());
        if (r && r.ratio < r.required) failures.push(`${node.target.join(' ')} "${r.text}": ${r.ratio.toFixed(2)} < ${r.required}`);
      }
    }
    expect(failures).toEqual([]);
  });
}

// Between the phone layout and the wide one the header keeps the patch volume beside its buttons.
for (const locale of ['en-US', 'pt-BR']) {
  test.describe(locale, () => {
    test.use({ locale });
    test('the patch volume stays on the button row at 721–900px, with no sideways scroll', async ({ page }) => {
      const sameRow = (a: { y: number; height: number }, b: { y: number; height: number }) => a.y < b.y + b.height && b.y < a.y + a.height;
      await connectMatribox(page);
      const head = page.locator('.preset-head');
      for (const width of [721, 800, 900]) {
        await page.setViewportSize({ width, height: 800 });
        const read = (await head.getByRole('button', { name: /^(Read|Ler)$/ }).boundingBox())!;
        const knob = (await head.getByRole('slider').boundingBox())!;
        expect(sameRow(read, knob), `at ${width}px`).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  });
}

test('back from the models, the add menu focuses and highlights the block type chosen before', async ({ page }) => {
  await connectMatribox(page);
  await page.getByRole('button', { name: 'Add a block…' }).click();
  const types = page.getByRole('listbox', { name: 'Add a block: type' });
  await types.getByRole('option', { name: 'DLY', exact: true }).click();
  await page.mouse.move(0, 0); // a pointer resting on the list would highlight what it rests on
  await expect(page.getByRole('listbox', { name: 'Add a block: DLY model' })).toBeFocused();
  await page.keyboard.press('Home'); // "‹ Back to block types"
  await page.keyboard.press('Enter');
  await expect(types).toBeFocused();
  const dly = types.getByRole('option', { name: 'DLY', exact: true });
  await expect(dly).toHaveClass(/is-active/);
  await expect(types).toHaveAttribute('aria-activedescendant', (await dly.getAttribute('id'))!);
  // Escape from the models goes back the same way.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Add a block: DLY model' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(types).toBeFocused();
  await expect(dly).toHaveClass(/is-active/);
});

test('on a desktop the add menu hangs under the add tile, inside the screen, even when its row is short', async ({ page }) => {
  for (const width of [1280, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    await connectMatribox(page);
    const add = page.getByRole('button', { name: 'Add a block…' });
    await add.click();
    for (const step of ['type', 'DRV model']) {
      if (step !== 'type') await page.getByRole('listbox', { name: 'Add a block: type' }).getByRole('option', { name: 'DRV', exact: true }).click();
      const menu = (await page.getByRole('listbox', { name: `Add a block: ${step}` }).boundingBox())!;
      const tile = (await add.boundingBox())!;
      expect(menu.y, `${step} at ${width}px`).toBeGreaterThanOrEqual(tile.y + tile.height);
      expect(menu.y, `${step} at ${width}px`).toBeLessThan(tile.y + tile.height + 16);
      expect(menu.x, `${step} at ${width}px`).toBeLessThanOrEqual(tile.x + tile.width);
      expect(menu.x + menu.width, `${step} at ${width}px`).toBeGreaterThan(tile.x);
      expect(menu.x + menu.width, `${step} at ${width}px`).toBeLessThanOrEqual(width);
      expect(menu.x).toBeGreaterThanOrEqual(0);
    }
    await page.keyboard.press('Tab');
  }
});
