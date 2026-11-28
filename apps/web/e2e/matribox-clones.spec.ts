import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import { encodeClo } from '@pocket-master/core';
import { en, pt } from '../lib/messages.ts';
import { connectMatribox, expect, test, openDock } from './matribox-fixtures.ts';

const NAM = new URL('../../../packages/core/test/fixtures/clo/ref_input.nam', import.meta.url);
const PICK = 'Choose a capture file (.nam or .clo)';

/** A tiny valid capture: an impulse into an impulse, a little drive between. */
const clo = () => {
  const impulse = (n: number) => Float32Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
  return Buffer.from(encodeClo({ arrayA: impulse(128), arrayB: impulse(2048), gains: [0.1, 0.1, 10, 10] }));
};
const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/octet-stream', buffer });
const panel = (page: Page) => page.getByRole('region', { name: 'Clones' });

test('a .clo is checked, named and written to CLONE 9 only after the confirmation', async ({ page, unit }) => {
  await connectMatribox(page);
  await openDock(page, 'Clones & IRs');
  const clones = panel(page);
  await expect(clones.getByRole('listbox')).toHaveCount(0);
  await expect(clones.getByText('CLONE 9')).toBeVisible();
  await clones.getByLabel(PICK).setInputFiles(file('my amp.clo', clo()));
  await expect(clones.getByRole('textbox', { name: 'Name' })).toHaveValue('my amp');
  await expect(clones.getByText(/^Ready\. Level on a guitar signal/)).toBeVisible();
  await clones.getByRole('textbox', { name: 'Name' }).fill('Test Amp');
  await clones.getByRole('combobox', { name: 'Slot' }).selectOption('8');

  const dialog = page.getByRole('dialog', { name: 'Write to CLONE 9' });
  await clones.getByRole('button', { name: 'Write to CLONE 9' }).click();
  await expect(dialog.getByText('This replaces CLONE 9 with “Test Amp”.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Write to CLONE 9' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(unit.cloneUploads).toHaveLength(0);

  await clones.getByRole('button', { name: 'Write to CLONE 9' }).click();
  await dialog.getByRole('checkbox', { name: 'I understand: overwrite CLONE 9' }).check();
  await dialog.getByRole('button', { name: 'Write to CLONE 9' }).click();
  await expect(clones.getByText('Written to CLONE 9 as “Test Amp”. Pick it in a CLONE block.')).toBeVisible();
  expect(unit.cloneUploads).toHaveLength(1);
  await expect(clones.getByRole('listitem').filter({ hasText: 'CLONE 9' })).toContainText('Test Amp');
});

test('a .nam whose reference signal cannot be downloaded shows the error and sends nothing', async ({ page, unit }) => {
  await page.route('https://raw.githubusercontent.com/skyggedans/SonicMaster/**', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await connectMatribox(page);
  await openDock(page, 'Clones & IRs');
  const clones = panel(page);
  await clones.getByLabel(PICK).setInputFiles(file('Rectifier Crunch.nam', readFileSync(NAM)));
  await expect(clones.getByRole('textbox', { name: 'Name' })).toHaveValue('Rectifier Crunch');
  await clones.getByRole('button', { name: 'Convert' }).click();
  await expect(clones.getByRole('alert')).toContainText('Could not download the reference DI for the conversion (HTTP 404).');
  await expect(clones.getByRole('button', { name: /^Write to CLONE/ })).toHaveCount(0);
  expect(unit.cloneUploads).toHaveLength(0);
});

// Groq is simulated: every call is answered here, so nothing leaves the machine.
const call = (name: string, args: unknown) => ({
  choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'g1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});

test('the assistant proposes a capture from a link; the Clones panel asks the person, who confirms', async ({ page, unit }) => {
  const replies = [
    call('upload_clone', { slot: 4, name: 'Rect Crunch', url: 'https://clones.example/amp.clo' }),
    { choices: [{ message: { role: 'assistant', content: 'Written, if you confirmed.' } }] },
  ];
  const requests: { messages: { role: string; content: string | null }[] }[] = [];
  await page.route('https://api.groq.com/**', async (route: Route) => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [] } });
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: replies.shift() });
  });
  await page.route('https://clones.example/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/octet-stream', body: clo() }));
  await connectMatribox(page);
  await openDock(page, 'Assistant');
  const chat = page.getByRole('region', { name: 'Tone assistant' });
  const setup = chat.getByRole('region', { name: 'Groq key' });
  await setup.getByLabel('Groq API key').fill('fake-groq-key-e2e-0000');
  await setup.getByRole('button', { name: 'Save key' }).click();
  await chat.getByRole('textbox', { name: 'Message to the tone assistant' }).fill('put a Rectifier on CLONE 4 from that link');
  await chat.getByRole('button', { name: 'Send' }).click();

  const dialog = page.getByRole('dialog', { name: 'Write to CLONE 4' });
  await expect(dialog.getByText(/^This replaces CLONE 4 \(“.+”\) with “Rect Crunch”\.$/)).toBeVisible();
  expect(unit.cloneUploads).toHaveLength(0); // proposed only
  await dialog.getByRole('checkbox', { name: 'I understand: overwrite CLONE 4' }).check();
  await dialog.getByRole('button', { name: 'Write to CLONE 4' }).click();
  await expect(chat.getByText('Written, if you confirmed.')).toBeVisible();
  expect(unit.cloneUploads).toHaveLength(1);
  expect(JSON.stringify(requests[1]!.messages.at(-1))).toContain('The person wrote \\"Rect Crunch\\" to CLONE 4.');
  await openDock(page, 'Clones & IRs');
  await expect(panel(page).getByText('Written to CLONE 4 as “Rect Crunch”.')).toBeVisible();
});

test('a link that cannot be downloaded is an error for the assistant, and the person is not asked', async ({ page, unit }) => {
  const replies = [call('upload_clone', { slot: 2, name: 'Nope', url: 'https://clones.example/missing.nam' }), { choices: [{ message: { role: 'assistant', content: 'That link failed.' } }] }];
  const requests: { messages: { role: string; content: string | null }[] }[] = [];
  await page.route('https://api.groq.com/**', async (route: Route) => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [] } });
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: replies.shift() });
  });
  await page.route('https://clones.example/**', (route) => route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'no' }));
  await connectMatribox(page);
  await openDock(page, 'Assistant');
  const chat = page.getByRole('region', { name: 'Tone assistant' });
  const setup = chat.getByRole('region', { name: 'Groq key' });
  await setup.getByLabel('Groq API key').fill('fake-groq-key-e2e-0000');
  await setup.getByRole('button', { name: 'Save key' }).click();
  await chat.getByRole('textbox', { name: 'Message to the tone assistant' }).fill('use that link');
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(chat.getByText('That link failed.')).toBeVisible();
  expect(JSON.stringify(requests[1]!.messages.at(-1))).toContain('HTTP 404');
  expect(unit.cloneUploads).toHaveLength(0);
});

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' });
  test('the Clones panel leaves no English on the page', async ({ page }) => {
    await connectMatribox(page);
    await openDock(page, pt['ws.rack.clones']);
    const clones = page.getByRole('region', { name: pt['mbClone.title'] });
    await clones.getByLabel(pt['mbClone.pick']).setInputFiles(file('meu amp.clo', clo()));
    await expect(clones.getByText(/^Pronto\./)).toBeVisible();
    await clones.getByRole('combobox', { name: pt['save.slot'] }).selectOption('8');
    await clones.getByRole('button', { name: pt['mbClone.write'].replace('{slot}', '9') }).click();
    const dialog = page.getByRole('dialog', { name: pt['mbClone.confirmTitle'].replace('{slot}', '9') });
    // Words only the English messages use ("capture" is in both): a sign of an untranslated text.
    const words = (s: string) =>
      s
        .replace(/\{\w+\}/g, ' ')
        .toLowerCase()
        .match(/[a-zà-ú]{4,}/g) ?? [];
    const ptWords = new Set(Object.values(pt).flatMap(words));
    const englishOnly = new Set(
      Object.values(en)
        .flatMap(words)
        .filter((w) => !ptWords.has(w)),
    );
    for (const text of [await clones.innerText(), await dialog.innerText()]) {
      const found = words(text.replace(/“[^”]*”/g, '')).filter((w) => englishOnly.has(w));
      expect(found).toEqual([]);
    }
  });
});
