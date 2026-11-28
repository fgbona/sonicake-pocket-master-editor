import { MB_GLOBALS, readFloat32LE } from '@pocket-master/core';
import type { Locator, Page } from '@playwright/test';
import { connectMatribox, expect, test, openDock } from './matribox-fixtures.ts';

/** Types a value into a knob: the value button, the text field, Enter. */
async function typeKnob(dialog: Locator, label: RegExp | string, value: string) {
  await dialog.getByRole('button', { name: label instanceof RegExp ? new RegExp(`Type a value for “${label.source.replace('^', '')}`) : `Type a value for “${label}”` }).click();
  await dialog.getByRole('textbox', { name: label instanceof RegExp ? new RegExp(`${label.source}.* value$`) : `${label} value` }).fill(value);
  await dialog.getByRole('textbox').press('Enter');
}

/** Delivers a frame the simulated unit sends on its own (no request from the editor). */
const fromUnit = (page: Page, frame: Uint8Array) => page.evaluate((bytes) => window.__midi.receive('Matribox II PRO', bytes), Array.from(frame));

async function openGlobals(page: Page) {
  await connectMatribox(page);
  await page.getByRole('button', { name: 'Global options' }).click();
  // No dialog: the button opens the dock's Global & EQ tab, where the settings live.
  return page.getByRole('region', { name: 'Global options' });
}

test('Global options shows what the unit holds and writes each change to it', async ({ page, unit }) => {
  const dialog = await openGlobals(page);
  const general = () => unit.globals.general;
  await expect(dialog.getByRole('radiogroup', { name: 'Input mode' }).getByRole('radio', { name: 'Electric' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('switch', { name: 'Global EQ on' })).toHaveAttribute('aria-checked', 'true');

  await dialog.getByRole('radiogroup', { name: 'Input mode' }).getByRole('radio', { name: 'Line' }).click();
  await expect.poll(() => general()[MB_GLOBALS.inputMode.at]).toBe(2);

  await typeKnob(dialog, /^Input level/, '-6');
  await expect.poll(() => general()[MB_GLOBALS.inputLevel.at]).toBe(0xfa);
  await typeKnob(dialog, /^AUX level/, '80');
  await expect.poll(() => general()[MB_GLOBALS.auxLevel.at]).toBe(80);

  // Brightness is shown only (the unit takes no write of it).
  await expect(dialog.getByText('50 %')).toBeVisible();

  // 0 Stomp, 1 Preset: the simulated unit starts in Preset.
  await dialog.getByRole('radiogroup', { name: 'Footswitch mode' }).getByRole('radio', { name: 'Stomp' }).click();
  await expect.poll(() => general()[MB_GLOBALS.currentMode.at]).toBe(0);

  // Global Tempo: the BPM first (the unit refuses to switch it on without one), then on.
  await typeKnob(dialog, /^Tempo/, '120');
  await expect.poll(() => general()[MB_GLOBALS.tempoBpm.at]).toBe(120);
  await dialog.getByRole('switch', { name: 'Global tempo' }).click();
  await expect.poll(() => general()[MB_GLOBALS.tempoOn.at]).toBe(1);

  // MIDI In Source: TRS only is shown but cannot be picked (the editor's Control Changes need USB).
  const source = dialog.getByRole('combobox', { name: /^MIDI In Source/ });
  await expect(source.locator('option', { hasText: 'TRS only' })).toBeDisabled();
  await source.selectOption({ label: 'USB only' });
  await expect.poll(() => general()[MB_GLOBALS.midiSource.at]).toBe(1);

  await dialog.getByRole('combobox', { name: /^Input channel \(USB\)/ }).selectOption({ label: '5' });
  await expect.poll(() => general()[MB_GLOBALS.midiInUsb.at]).toBe(5);
  await dialog.getByRole('combobox', { name: /^Input channel \(TRS\)/ }).selectOption({ label: '3' });
  await expect.poll(() => general()[MB_GLOBALS.midiInTrs.at]).toBe(3);

  // The EQ: the ON button, the Level knob, and a node per band on the graph.
  const eqWord = (word: number) => readFloat32LE(unit.globals.eq, word * 4);
  const node2 = dialog.getByRole('slider', { name: /^Band 2 · 500 Hz/ });
  const node4 = dialog.getByRole('slider', { name: /^Band 4 · 5 kHz/ });
  await expect(dialog.getByRole('slider', { name: /^Band \d · / })).toHaveCount(4);
  await expect(node2).toHaveAttribute('aria-valuenow', '0');
  await expect(node4).toHaveAttribute('aria-valuetext', '+1 dB');
  await expect(dialog.getByRole('slider', { name: /^Band 1 · 250 Hz/ })).toHaveAttribute('aria-valuetext', '-1 dB');
  await expect(dialog.getByRole('img', { name: 'Global EQ response' })).toBeVisible();

  await dialog.getByRole('switch', { name: 'Global EQ on' }).click();
  await expect.poll(() => unit.globals.eqOn).toBe(false);
  await dialog.getByRole('switch', { name: 'Global EQ on' }).click();
  await expect.poll(() => unit.globals.eqOn).toBe(true);

  const level = dialog.getByRole('slider', { name: /^Level/ });
  await level.focus();
  await level.press('ArrowUp');
  await expect.poll(() => eqWord(30)).toBe(51);
  await level.press('End');
  await expect.poll(() => eqWord(30)).toBe(100);

  await node2.focus();
  await node2.press('ArrowUp');
  await node2.press('PageUp');
  await expect.poll(() => eqWord(14)).toBe(6);
  await expect(node2).toHaveAttribute('aria-valuetext', '+6 dB');
  await node2.press('Home');
  await expect.poll(() => eqWord(14)).toBe(-20);
  // A double-click resets the band to 0 dB.
  await node2.dblclick();
  await expect.poll(() => eqWord(14)).toBe(0);

  // Dragging a node up raises its gain; the selected band's knob follows.
  const box = (await node4.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 40, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => eqWord(22)).toBeGreaterThan(1);
  await expect(dialog.getByRole('slider', { name: /^Band 4 gain/ })).toBeVisible();
  await node4.press('Home');
  await expect.poll(() => eqWord(22)).toBe(-20);
  await dialog.getByRole('slider', { name: /^Band 4 gain/ }).press('ArrowUp');
  await expect.poll(() => eqWord(22)).toBe(-19);

  // The cuts: nodes L and H, and their frequency knobs.
  await expect(dialog.getByRole('slider', { name: 'Lo Cut · 80 Hz' })).toHaveAttribute('aria-valuenow', '80');
  await expect(dialog.getByRole('slider', { name: 'Hi Cut · 8 kHz' })).toHaveAttribute('aria-valuenow', '8000');
  await expect(dialog.getByRole('slider', { name: 'Lo Cut frequency' })).toHaveAttribute('aria-valuetext', '80 Hz');
  await typeKnob(dialog, 'Lo Cut frequency', '120');
  await expect.poll(() => eqWord(1)).toBe(120);
  await typeKnob(dialog, 'Hi Cut frequency', '9000');
  await expect.poll(() => eqWord(28)).toBe(9000);
  await dialog.getByRole('slider', { name: /^Lo Cut · / }).dblclick(); // a double-click turns the cut off
  await expect.poll(() => eqWord(1)).toBe(19);
  await expect(dialog.getByRole('slider', { name: 'Lo Cut frequency' })).toHaveAttribute('aria-valuetext', 'off');
  const hiNode = dialog.getByRole('slider', { name: /^Hi Cut · / });
  await hiNode.focus();
  await hiNode.press('ArrowLeft');
  await expect.poll(() => eqWord(28)).toBeLessThan(9000);

  // Frequency and Q of a band: the knobs, the keyboard and a sideways drag.
  await typeKnob(dialog, 'Band 2 frequency', '600');
  await expect.poll(() => eqWord(12)).toBe(600);
  await expect(dialog.getByRole('slider', { name: /^Band 2 · 600 Hz/ })).toBeVisible();
  await typeKnob(dialog, 'Band 2 Q', '2');
  await expect.poll(() => eqWord(13)).toBeCloseTo(2, 3);
  const band2 = dialog.getByRole('slider', { name: /^Band 2 · / });
  await band2.focus();
  await band2.press('Alt+ArrowUp');
  await expect.poll(() => eqWord(13)).toBeCloseTo(2.1, 3);
  await band2.press('ArrowRight');
  await expect.poll(() => eqWord(12)).toBeGreaterThan(600);
  const band1 = dialog.getByRole('slider', { name: /^Band 1 · / });
  const at = (await band1.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 + 50, at.y + at.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => eqWord(8)).toBeGreaterThan(250);

  // The tuner and tempo controls now go on the unit's channel.
  await openDock(page, 'Controls');
  await expect(page.getByRole('combobox', { name: 'MIDI channel' })).toHaveValue('5');
});

test('Global options follows the settings changed on the unit', async ({ page, unit }) => {
  const dialog = await openGlobals(page);
  const mode = dialog.getByRole('radiogroup', { name: 'Footswitch mode' });
  await expect(mode.getByRole('radio', { name: 'Preset' })).toHaveAttribute('aria-checked', 'true');
  await fromUnit(page, unit.onUnitGlobal('currentMode', 0));
  await expect(mode.getByRole('radio', { name: 'Stomp' })).toHaveAttribute('aria-checked', 'true');

  await fromUnit(page, unit.onUnitGlobal('tempoBpm', 100)); // the tempo turned on the unit (mb-37)
  await expect(dialog.getByRole('slider', { name: /^Tempo/ })).toHaveAttribute('aria-valuenow', '100');
});

test('a global write the unit does not confirm is an error, and the unit is read again', async ({ page, unit }) => {
  const dialog = await openGlobals(page);
  unit.echoes = false; // the unit takes the write but does not confirm it
  await dialog.getByRole('radiogroup', { name: 'Input mode' }).getByRole('radio', { name: 'Line' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'did not confirm the write' })).toBeVisible({ timeout: 10_000 });
  // The read after the failure shows what the unit holds (it did take it here).
  await expect(dialog.getByRole('radiogroup', { name: 'Input mode' }).getByRole('radio', { name: 'Line' })).toHaveAttribute('aria-checked', 'true');
});

test('Global Tempo switched on but not accepted on the unit says so', async ({ page, unit }) => {
  const dialog = await openGlobals(page);
  await typeKnob(dialog, /^Tempo/, '120');
  await expect.poll(() => unit.globals.general[MB_GLOBALS.tempoBpm.at]).toBe(120);
  unit.echoes = false; // the unit waits for the prompt on its screen to be accepted
  await dialog.getByRole('switch', { name: 'Global tempo' }).click();
  await expect(page.getByRole('alert').filter({ hasText: "accept it on the unit's screen" })).toBeVisible({ timeout: 10_000 });
});

test('the folded groups write USB audio, EXP 2, MIDI outputs and clock, Auto CAB and bank select', async ({ page, unit }) => {
  const dialog = await openGlobals(page);
  const general = () => unit.globals.general;
  await dialog.getByRole('switch', { name: 'Auto CAB' }).click(); // the simulated unit starts with it on
  await expect.poll(() => general()[MB_GLOBALS.autoCab.at]).toBe(0);
  await dialog.getByRole('radiogroup', { name: 'Bank select' }).getByRole('radio', { name: 'Immediate' }).click();
  await expect.poll(() => general()[MB_GLOBALS.bankMode.at]).toBe(1);

  // Folded until opened: the less used settings stay out of the way.
  await expect(dialog.getByRole('slider', { name: /^Recording level/ })).toBeHidden();
  await dialog.getByText('USB audio', { exact: true }).click();
  await typeKnob(dialog, /^Recording level/, '-4');
  await expect.poll(() => general()[MB_GLOBALS.usbRecLevel.at]).toBe(0xfc);
  await typeKnob(dialog, /^Monitor level/, '3');
  await expect.poll(() => general()[MB_GLOBALS.usbMonitorLevel.at]).toBe(3);
  await dialog.getByRole('switch', { name: 'Record AUX IN too' }).click();
  await expect.poll(() => general()[MB_GLOBALS.usbRecAux.at]).toBe(0);
  await dialog.getByRole('radiogroup', { name: 'Recording L' }).getByRole('radio', { name: 'Dry' }).click();
  await expect.poll(() => general()[MB_GLOBALS.usbRecWetL.at]).toBe(0);

  await dialog.getByText('EXP 2 and external footswitches', { exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'External footswitch 1' })).toHaveCount(0);
  await dialog.getByRole('radiogroup', { name: 'EXP 2 jack' }).getByRole('radio', { name: 'Two footswitches' }).click();
  await expect.poll(() => general()[MB_GLOBALS.exp2Jack.at]).toBe(2);
  await dialog.getByRole('combobox', { name: 'External footswitch 1' }).selectOption({ label: 'Tap tempo' });
  await expect.poll(() => general()[MB_GLOBALS.extFs1.at]).toBe(8);
  await dialog.getByRole('combobox', { name: 'External footswitch 2' }).selectOption({ label: 'Tuner' });
  await expect.poll(() => general()[MB_GLOBALS.extFs2.at]).toBe(7);

  await dialog.getByText('MIDI outputs and clock', { exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Output channel (USB)' }).selectOption({ label: 'Off' });
  await expect.poll(() => [general()[MB_GLOBALS.midiOutUsb.at], general()[MB_GLOBALS.midiOutUsb.at + 1]]).toEqual([0xff, 0xff]);
  await dialog.getByRole('combobox', { name: 'Output channel (TRS)' }).selectOption({ label: '2' });
  await expect.poll(() => general()[MB_GLOBALS.midiOutTrs.at]).toBe(2);
  await dialog.getByRole('combobox', { name: 'Clock source' }).selectOption({ label: 'Internal' });
  await expect.poll(() => general()[MB_GLOBALS.clockSource.at]).toBe(0);
  await dialog.getByRole('switch', { name: 'Send clock (USB)' }).click();
  await expect.poll(() => general()[MB_GLOBALS.clockOut.at]).toBe(2);
  await dialog.getByRole('switch', { name: 'Send clock (TRS)' }).click();
  await expect.poll(() => general()[MB_GLOBALS.clockOut.at]).toBe(3);
});
