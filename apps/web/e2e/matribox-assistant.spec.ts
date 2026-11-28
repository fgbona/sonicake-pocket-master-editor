import type { Page, Route } from '@playwright/test';
import { mbAssignments, parseMbPreset } from '@pocket-master/core';
import { blockPanel, connectMatribox, expect, expectChain, MODELS, test, turnKnob, openDock } from './matribox-fixtures.ts';

// Groq is simulated: every call is answered here, so nothing leaves the machine.
type Reply = { body: unknown };
const call = (name: string, args: unknown): Reply => ({
  body: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'g1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
});
const say = (text: string): Reply => ({ body: { choices: [{ message: { role: 'assistant', content: text } }] } });

async function fakeGroq(page: Page, replies: Reply[]) {
  const requests: { messages: { role: string; content: string | null }[] }[] = [];
  await page.route('https://api.groq.com/**', async (route: Route) => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [] } });
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: (replies.shift() ?? say('(no more scripted replies)')).body });
  });
  return requests;
}

const panel = (page: Page) => page.getByRole('region', { name: 'Tone assistant' });
const chain = expectChain;
const loaded = (unit: { editBuffer: Uint8Array }) => parseMbPreset(unit.editBuffer);

async function openChat(page: Page) {
  await openDock(page, 'Assistant');
  const setup = panel(page).getByRole('region', { name: 'Groq key' });
  await setup.getByLabel('Groq API key').fill('fake-groq-key-e2e-0000');
  await setup.getByRole('button', { name: 'Save key' }).click();
  await expect(panel(page).getByRole('button', { name: 'Keys' })).toBeVisible();
}

async function ask(page: Page, text: string) {
  await panel(page).getByRole('textbox', { name: 'Message to the tone assistant' }).fill(text);
  await panel(page).getByRole('button', { name: 'Send' }).click();
}

test('the assistant builds a whole chain on the unit, shows what changed, and Undo/Redo replay it', async ({ page, unit }) => {
  const requests = await fakeGroq(page, [
    call('build_tone', {
      blocks: [
        { module: 'DRV', model: MODELS.od.name, params: [{ name: 'Gain', value: 80 }] },
        { module: 'AMP', model: MODELS.amp.name, params: [{ name: 'Gain', value: 60 }] },
        { module: 'DLY', model: MODELS.echo.name, on: false },
      ],
    }),
    say('A Zendrive into a Shiva.'),
  ]);
  await connectMatribox(page);
  await openChat(page);
  await ask(page, 'Hendrix, Purple Haze');
  await expect(panel(page).getByText('A Zendrive into a Shiva.')).toBeVisible();

  // The model got the built-in catalog (models with the gear they are based on) and the loaded preset.
  const first = requests[0]!.messages.at(-1)!.content!;
  expect(first).toContain(`${MODELS.drive.name} (${MODELS.drive.basedOn})`);
  expect(first).not.toMatch(/alg_data/);
  expect(first).toContain('Name: Drive AD');

  await chain(page, 'DRV → AMP → DLY');
  expect(loaded(unit).chain.map((b) => [b.fxid, b.on, b.values[0]])).toEqual([
    [0x03000010, true, 80],
    [0x0700001a, true, 60],
    [0x0b000001, false, MODELS.echo.params[0]!.defaultValue],
  ]);
  const changes = panel(page).getByRole('region', { name: 'What changed' });
  await expect(changes.getByText('DYN DRV AMP CAB RVB VOL → DRV AMP DLY')).toBeVisible();
  await expect(changes.getByText(`DRV · ${MODELS.od.name}`)).toHaveCount(MODELS.od.params.length);

  await page.getByRole('button', { name: 'Undo' }).click();
  await chain(page, 'DYN → DRV → AMP → CAB → RVB → VOL');
  expect(loaded(unit).chain[2]!.values[0]).toBe(30);
  await page.getByRole('button', { name: 'Redo' }).click();
  await chain(page, 'DRV → AMP → DLY');
  expect(loaded(unit).chain[0]!.values[0]).toBe(80);
});

test('the assistant makes the tone live-ready: EXP, a footswitch and a quick knob, shown in the Controls panels', async ({ page, unit }) => {
  const requests = await fakeGroq(page, [
    call('set_controls', {
      changes: [
        { kind: 'expression', entry: 4, block: 'DRV', parameter: 'Tone', min: 20, max: 100 },
        { kind: 'footswitch', footswitch: 'B', block: 'RVB' },
        { kind: 'quick_knob', knob: 1, target: 'DRV', parameter: 'Gain' },
      ],
    }),
    say('EXP 1 mode B sweeps the drive tone, FS B toggles the reverb, knob 1 is the drive gain.'),
  ]);
  await connectMatribox(page);
  await openChat(page);
  await ask(page, 'Make it ready to play live');
  await expect(panel(page).getByText('FS B toggles the reverb')).toBeVisible();

  const a = mbAssignments(loaded(unit));
  expect(a.expression[3]).toEqual({ entry: 3, slot: 0, paramId: 1, min: 20, max: 100 });
  expect(a.ctrl[1]).toContain(4);
  expect(a.quickKnobs[0]).toEqual({ knob: 0, target: 0, paramId: 0 });
  // The tool answer the model read back lists the controls as the unit has them now.
  const answer = requests[1]!.messages.at(-1)!.content!;
  expect(answer).toMatch(/Quick knob 1: 2 DRV Gain/);
  await openDock(page, 'Controls');
  await expect(page.getByRole('region', { name: 'Footswitches and CTRL (stomp mode)' }).getByRole('switch', { name: 'CTRL 2 switches 5. RVB' })).toHaveAttribute('aria-checked', 'true');
});

test("Undo and Redo replay the editor's own edits through the unit, from the buttons and the keyboard", async ({ page, unit }) => {
  await connectMatribox(page);
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeDisabled();

  const drive = await blockPanel(page, 2, 'DRV');
  await turnKnob(drive.getByRole('slider', { name: 'Gain' }), 77);
  await expect.poll(() => loaded(unit).chain[1]!.values[0]).toBe(77);
  await drive.getByRole('switch', { name: '2. DRV off' }).click();
  const reverb = await blockPanel(page, 5, 'RVB');
  await reverb.getByRole('button', { name: 'Remove 5. RVB from the chain' }).click();
  await chain(page, 'DYN → DRV → AMP → CAB → VOL');

  await undo.click();
  await chain(page, 'DYN → DRV → AMP → CAB → RVB → VOL');
  expect(loaded(unit).chain[4]!.values.slice(0, 2)).toEqual([25, 0]);
  await expect(undo).toBeEnabled();
  await page.locator('h1').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => loaded(unit).chain[1]!.on).toBe(false);
  await expect(undo).toBeEnabled(); // the step is kept (the editor is not busy any more)
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => loaded(unit).chain[1]!.values[0]).toBe(15);
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
  await expect(undo).toBeDisabled(); // back where it started
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => loaded(unit).chain[1]!.values[0]).toBe(77);
});

test('the assistant only proposes a save: the person confirms it in the Save dialog', async ({ page, unit }) => {
  const requests = await fakeGroq(page, [call('save_preset', { slot: '2B', name: 'Purple Haze' }), say('Saved if you confirmed.')]);
  await connectMatribox(page);
  await openChat(page);
  await ask(page, 'save it on 2B');
  const dialog = page.getByRole('dialog', { name: 'Save to the Matribox' });
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Purple Haze');
  expect(unit.stored(5) ? parseMbPreset(unit.stored(5)!).name : '').not.toBe('Purple Haze');
  await dialog.getByRole('checkbox', { name: /Replace 2B/ }).check();
  await dialog.getByRole('button', { name: 'Save to 2B' }).click();
  await expect(dialog.getByText('Saved to 2B “Purple Haze”.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(panel(page).getByText('Saved if you confirmed.')).toBeVisible();
  expect(parseMbPreset(unit.stored(5)!).name).toBe('Purple Haze');
  expect(JSON.stringify(requests[1]!.messages.at(-1))).toContain('The person saved it to 2B');
});

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' });
  test('the Matribox assistant speaks Portuguese', async ({ page }) => {
    await connectMatribox(page);
    await openDock(page, 'Assistente');
    await expect(page.getByText(/o catálogo de modelos vão para o provedor da sua chave/)).toBeVisible();
  });
});
