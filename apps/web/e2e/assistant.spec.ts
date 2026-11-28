import { test, expect, connect, openDock } from './fixtures.ts';
import type { Page, Route } from '@playwright/test';

// Gemini is simulated: every call to Google is answered here, so nothing leaves the machine.
const KEY = 'fake-gemini-key-e2e-0000';

type Reply = { status?: number; body: unknown };
const call = (name: string, args: unknown, id = 'c1'): Reply => ({ body: { status: 'requires_action', steps: [{ type: 'function_call', id, name, arguments: args }] } });
const say = (text: string): Reply => ({ body: { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] } });

/** Answers Gemini requests with `replies` in order; returns the request bodies. */
async function fakeGemini(page: Page, replies: Reply[], keyOk = true) {
  const requests: Record<string, unknown>[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/models')) {
      return route.fulfill(keyOk ? { json: { models: [] } } : { status: 400, json: { error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } });
    }
    requests.push(route.request().postDataJSON());
    const r = replies.shift() ?? say('(no more scripted replies)');
    return route.fulfill({ status: r.status ?? 200, json: r.body });
  });
  return requests;
}

const panel = (page: Page) => page.getByRole('region', { name: 'Tone assistant' });
const geminiSetup = (page: Page) => panel(page).getByRole('region', { name: 'Google Gemini key' });
const groqSetup = (page: Page) => panel(page).getByRole('region', { name: 'Groq key' });
const GROQ_KEY = 'fake-groq-key-e2e-0000';

type GroqReply = { status?: number; body: unknown; headers?: Record<string, string> };
const groqCall = (name: string, args: unknown, id = 'g1'): GroqReply => ({
  body: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
});
const groqSay = (text: string): GroqReply => ({ body: { choices: [{ message: { role: 'assistant', content: text } }] } });

/** Answers Groq requests with `replies` in order; returns the request bodies. */
async function fakeGroq(page: Page, replies: GroqReply[]) {
  const requests: Record<string, unknown>[] = [];
  await page.route('https://api.groq.com/**', async (route: Route) => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [] } });
    requests.push(route.request().postDataJSON());
    const r = replies.shift() ?? groqSay('(no more scripted replies)');
    return route.fulfill({ status: r.status ?? 200, json: r.body, headers: r.headers });
  });
  return requests;
}

async function addGroqKey(page: Page) {
  await groqSetup(page).getByLabel('Groq API key').fill(GROQ_KEY);
  await groqSetup(page).getByRole('button', { name: 'Save key' }).click();
  await expect(panel(page).getByRole('button', { name: 'Keys' })).toBeVisible();
}
const amp = (page: Page) => page.locator('section.block-amp');
async function pickAmp(page: Page, model: string) {
  await amp(page).locator('.picker-button').click();
  await page.getByRole('option', { name: new RegExp(`^${model}\\b`) }).click();
}

async function addKey(page: Page) {
  await geminiSetup(page).getByLabel('Gemini API key').fill(KEY);
  await geminiSetup(page).getByRole('button', { name: 'Save key' }).click();
  await expect(panel(page).getByRole('button', { name: 'Keys' })).toBeVisible();
}

async function ask(page: Page, text: string) {
  await panel(page).getByRole('textbox', { name: 'Message to the tone assistant' }).fill(text);
  await panel(page).getByRole('button', { name: 'Send' }).click();
}

test('the key is checked before it is kept, and never shown back', async ({ page, pedal }) => {
  await fakeGemini(page, [], false);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await expect(panel(page).getByRole('link', { name: 'Open Google AI Studio' })).toHaveAttribute('href', 'https://aistudio.google.com/apikey');
  await expect(panel(page).getByRole('link', { name: 'Open the Groq console' })).toHaveAttribute('href', 'https://console.groq.com/keys');
  await expect(panel(page).getByText(/must say Free tier/)).toBeVisible();
  await geminiSetup(page).getByLabel('Gemini API key').fill('AIza-wrong');
  await geminiSetup(page).getByRole('button', { name: 'Save key' }).click();
  await expect(panel(page).getByText('Google Gemini did not accept this key.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pocket-master-editor.geminiKey.v1'))).toBeNull();

  await page.unroute('https://generativelanguage.googleapis.com/**');
  await fakeGemini(page, []);
  await addKey(page);
  await expect(page.locator('body')).not.toContainText(KEY);
});

test('describing a tone builds it live, lists what changed, and Undo takes it back', async ({ page, pedal }) => {
  const requests = await fakeGemini(page, [
    call('edit_preset', {
      changes: [
        { kind: 'model', block: 'AMP', model: 'Calif DualM' },
        { kind: 'parameter', block: 'AMP', parameter: 'Gain', value: 70 },
      ],
    }),
    say('Mesa Dual Rectifier with gain 70, like the Black Album rhythm.'),
  ]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'black album rhythm tone');
  await expect(panel(page).getByText('Mesa Dual Rectifier with gain 70', { exact: false })).toBeVisible();
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'mesa');
  await expect.poll(() => pedal.pedal.received).toContain('edit 47');
  await expect(panel(page).getByRole('region', { name: 'What changed' }).getByRole('listitem').filter({ hasText: 'AMP Model' })).toContainText('Brit 800 → Calif DualM');
  await expect(panel(page).getByText(/Gemini Flash: 2 of 20 free requests used today/)).toBeVisible();
  await expect(panel(page).getByText('Answered by Gemini Flash')).toBeVisible();
  // The first message carried the preset and the models; the key only went in a header.
  expect(JSON.stringify(requests[0])).toContain('Loaded preset:');
  expect(JSON.stringify(requests)).not.toContain(KEY);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'marshall');
});

test('saving is only a proposal: the Save dialog opens filled in, and Cancel saves nothing', async ({ page, pedal }) => {
  const requests = await fakeGemini(page, [call('save_preset', { slot: 'P45', name: 'BLACK ALB' }), say('Not saved, as you prefer.')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'save it on 45');
  const dialog = page.getByRole('dialog', { name: 'Save to a preset slot' });
  await expect(dialog.getByLabel('Slot')).toHaveValue('44');
  await expect(dialog.getByLabel('Name')).toHaveValue('BLACK ALB');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel(page).getByText('Not saved, as you prefer.')).toBeVisible();
  expect(pedal.pedal.received.some((r) => r.startsWith('save'))).toBe(false);
  expect(JSON.stringify(requests[1])).toContain('did not save');
});

test('a used-up free quota hands the message to the next model on its own', async ({ page, pedal }) => {
  const quota: Reply = {
    status: 429,
    body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '3600s' }] } },
  };
  const requests = await fakeGemini(page, [quota, say('Hello from Flash-Lite')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'hi');
  await expect(panel(page).getByText('Hello from Flash-Lite')).toBeVisible();
  await expect(panel(page).getByText('Answered by Gemini Flash-Lite')).toBeVisible();
  await expect(panel(page).getByText(/Gemini Flash: free requests used up, back at/)).toBeVisible();
  expect(requests.map((r) => r.model)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
});

test('what a tool reports matches the pedal: loading, reverting, and undo with nothing to undo', async ({ page, pedal }) => {
  const requests = await fakeGemini(page, [
    call('undo_edit', {}),
    say('Nothing to undo.'),
    call('select_preset', { preset: 'P10' }),
    say('Loaded P10.'),
    call('edit_preset', { changes: [{ kind: 'volume', value: 50 }] }, 'c3'),
    call('revert_preset', {}, 'c4'),
    say('Back as it was.'),
  ]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'undo that');
  await expect(panel(page).getByText('Nothing to undo.')).toBeVisible();
  expect(JSON.stringify(requests[1])).toMatch(/Nothing to undo: no change since the preset was loaded/);

  await ask(page, 'load P10');
  await expect(page.getByRole('heading', { name: /P10\s*THR-CLEAN/ })).toBeVisible();
  const loaded = JSON.stringify((requests[3]!.input as unknown[]).at(-1));
  expect(loaded).toContain('P10 \\"THR-CLEAN\\"');
  expect(loaded).toContain('unsaved changes: no');

  await ask(page, 'louder, then put it back');
  await expect(panel(page).getByText('Back as it was.')).toBeVisible();
  const reverted = JSON.stringify((requests[6]!.input as unknown[]).at(-1));
  expect(reverted).toContain('Reverted to the saved preset.');
  expect(reverted).toContain('unsaved changes: no');
});

test('with a Groq key, Groq builds the tone; when its quota runs out, Gemini takes over', async ({ page, pedal }) => {
  const groq = await fakeGroq(page, [
    groqCall('edit_preset', { changes: [{ kind: 'model', block: 'AMP', model: 'Calif DualM' }] }),
    groqSay('Rectifier on.'),
    { status: 429, body: { error: { message: 'Rate limit reached for requests per day' } }, headers: { 'retry-after': '3600' } },
  ]);
  const gemini = await fakeGemini(page, [say('Gemini here.')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addGroqKey(page);
  await ask(page, 'black album rhythm');
  await expect(panel(page).getByText('Rectifier on.')).toBeVisible();
  await expect(panel(page).getByText('Answered by Groq')).toBeVisible();
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'mesa');
  expect(JSON.stringify(groq)).not.toContain(GROQ_KEY);

  await panel(page).getByRole('button', { name: 'Keys' }).click();
  await expect(groqSetup(page).getByText(/Key fake…0000 saved on this device/)).toBeVisible();
  await geminiSetup(page).getByLabel('Gemini API key').fill(KEY);
  await geminiSetup(page).getByRole('button', { name: 'Save key' }).click();
  await panel(page).getByRole('button', { name: 'Back to the chat' }).click();
  await ask(page, 'more');
  await expect(panel(page).getByText('Gemini here.')).toBeVisible();
  await expect(panel(page).getByText(/Groq: free requests used up, back at/)).toBeVisible();
  // Gemini got the conversation so far as text, and the preset as it is now.
  const input = JSON.stringify(gemini[0]!.input);
  expect(input).toContain('black album rhythm');
  expect(input).toContain('Rectifier on.');
  expect(input).toContain('Loaded preset now:');
});

test('a refused Groq key is reported once while Gemini answers; a quota cut mid-answer is not redone elsewhere', async ({ page, pedal }) => {
  await page.route('https://api.groq.com/**', (route) =>
    route.request().url().endsWith('/models') ? route.fulfill({ json: { data: [] } }) : route.fulfill({ status: 401, json: { error: { message: 'Invalid API Key' } } }),
  );
  const gemini = await fakeGemini(page, [
    say('Hi from Gemini.'),
    call('edit_preset', { changes: [{ kind: 'volume', value: 50 }] }),
    { status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '60s' }] } } },
  ]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addGroqKey(page);
  await panel(page).getByRole('button', { name: 'Keys' }).click();
  await geminiSetup(page).getByLabel('Gemini API key').fill(KEY);
  await geminiSetup(page).getByRole('button', { name: 'Save key' }).click();
  await panel(page).getByRole('button', { name: 'Back to the chat' }).click();

  await ask(page, 'hi');
  await expect(panel(page).getByText('Hi from Gemini.')).toBeVisible();
  await expect(panel(page).getByText('Groq refused the saved key.', { exact: false })).toHaveCount(1);

  await ask(page, 'louder');
  await expect(panel(page).getByText(/Gemini Flash reached its free limit \(back at .+\) in the middle of this answer/)).toBeVisible();
  await expect(panel(page).getByText('Groq refused the saved key.', { exact: false })).toHaveCount(1);
  expect(
    gemini.map((r) => r.model),
    'Flash-Lite was not asked to redo the edit',
  ).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash']);
  expect(pedal.pedal.received.filter((r) => r === 'edit 42')).toHaveLength(1);
});

test('a key the browser will not keep says so; a failed answer stays in what the next one is told', async ({ page, pedal }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.includes('Key.v1')) throw new DOMException('blocked', 'SecurityError');
      return set.call(this, k, v);
    };
  });
  const requests = await fakeGemini(page, [{ status: 500, body: { error: { message: 'backend error' } } }, say('Second try worked.')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await panel(page).getByRole('button', { name: 'Keys' }).click();
  await expect(geminiSetup(page).getByText(/this browser would not keep the key/)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Back to the chat' }).click();
  await ask(page, 'black album');
  await expect(panel(page).getByText(/Something went wrong: Gemini answered 500/)).toBeVisible();
  await ask(page, 'try again');
  await expect(panel(page).getByText('Second try worked.')).toBeVisible();
  const told = JSON.stringify(requests[1]!.input);
  expect(told).toContain('black album');
  expect(told).toContain('answer was interrupted');
});

test('a tone kept by the assistant goes to the library, and a later conversation loads it from there', async ({ page, pedal }) => {
  const requests = await fakeGemini(page, [
    call('keep_tone', { name: 'BLACK RHY', notes: 'Metallica Black Album, rhythm' }),
    say('Kept it as BLACK RHY.'),
    call('load_saved_tone', { name: 'BLACK RHY' }, 'c2'),
    say('Loaded your Black Album tone.'),
  ]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'this sounds right, keep it');
  await expect(panel(page).getByText('Kept it as BLACK RHY.')).toBeVisible();
  await openDock(page, 'Library');
  const library = page.getByRole('region', { name: 'Preset library' });
  await expect(library.getByText('BLACK RHY')).toBeVisible();
  await expect(library.getByText('Metallica Black Album, rhythm', { exact: false })).toBeVisible();
  await openDock(page, 'AI Assistant');

  await pickAmp(page, 'Calif DualM');
  await panel(page).getByRole('button', { name: 'New conversation' }).click();
  await ask(page, 'black album rhythm');
  await expect(panel(page).getByText('Loaded your Black Album tone.')).toBeVisible();
  await expect(amp(page).getByText('Brit 800')).toBeVisible();
  expect(JSON.stringify(requests[2]!.input)).toContain('Saved tones (load_saved_tone):\\n- BLACK RHY: Metallica Black Album, rhythm');
});

test('an example request fills the message box, so a first-time user only has to press Send', async ({ page, pedal }) => {
  await fakeGemini(page, []);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await panel(page).getByRole('button', { name: 'Black Album rhythm tone' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Message to the tone assistant' })).toHaveValue('Black Album rhythm tone');
  await expect(panel(page).getByRole('textbox', { name: 'Message to the tone assistant' })).toBeFocused();
});

test("Google refusing the free tier in the person's region says so, with its list of regions", async ({ page, pedal }) => {
  const region: Reply = { status: 400, body: { error: { code: 400, status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } } };
  await fakeGemini(page, [region]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'hi');
  await expect(panel(page).getByText(/Google does not offer the Gemini API where you are/)).toBeVisible();
  await expect(panel(page).getByRole('link', { name: 'Where Gemini is available' })).toHaveAttribute('href', 'https://ai.google.dev/gemini-api/docs/available-regions');
});

test('a tone saved to another slot still lists what changed', async ({ page, pedal }) => {
  await fakeGemini(page, [call('edit_preset', { changes: [{ kind: 'model', block: 'AMP', model: 'Calif DualM' }] }), call('save_preset', { slot: 'P45', name: 'BLACK ALB' }), say('Saved on P45.')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'black album rhythm, save it on 45');
  const save = page.getByRole('dialog', { name: 'Save to a preset slot' });
  await save.getByRole('button', { name: 'Save to P45' }).click();
  await expect(save.getByText('Saved to P45')).toBeVisible();
  await save.getByRole('button', { name: 'Done' }).click();
  await expect(panel(page).getByText('Saved on P45.')).toBeVisible();
  await expect(panel(page).getByRole('region', { name: 'What changed' }).getByRole('listitem').filter({ hasText: 'AMP Model' })).toContainText('Brit 800 → Calif DualM');
});

test('an answer that changed nothing says so, instead of an empty space where the changes go', async ({ page, pedal }) => {
  await fakeGemini(page, [say('That is already the tone on the pedal.')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'black album rhythm tone');
  await expect(panel(page).getByText('That is already the tone on the pedal.')).toBeVisible();
  await expect(panel(page).getByText('Nothing changed on the pedal.')).toBeVisible();
});

test('a long change list scrolls with the conversation, not on its own', async ({ page, pedal }) => {
  await fakeGemini(page, [
    call('edit_preset', {
      changes: [
        { kind: 'model', block: 'AMP', model: 'Calif DualM' },
        { kind: 'model', block: 'DRV', model: 'Butter OD' },
        { kind: 'model', block: 'RVB', model: 'Room' },
        { kind: 'block', block: 'RVB', on: true },
      ],
    }),
    say('Done.'),
  ]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'black album rhythm tone');
  const list = panel(page).getByRole('region', { name: 'What changed' }).locator('ul');
  await expect(list.getByRole('listitem')).not.toHaveCount(0);
  expect(await list.evaluate((ul) => getComputedStyle(ul).overflowY)).toBe('visible');
  // The conversation shows the question at its top, so the answer is read from the start.
  const conversation = await panel(page).locator('.assistant-messages').boundingBox();
  const question = await panel(page).locator('.assistant-message.is-user').last().boundingBox();
  expect(Math.abs(question!.y - conversation!.y)).toBeLessThan(2);
});

test('asked to save, the editor opens the Save dialog even when the model only says it saved', async ({ page, pedal }) => {
  await fakeGemini(page, [say('Saved to P45 as BLACK.')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'black album rhythm tone, save it to P45');
  const save = page.getByRole('dialog', { name: 'Save to a preset slot' });
  await expect(save).toBeVisible();
  await expect(save.getByLabel('Slot')).toHaveValue('44');
  await expect(panel(page).getByText('The Save dialog is open for P45')).toBeVisible();
  await save.getByRole('button', { name: 'Cancel' }).click();
});

test('an answer cut after the sound changed still opens the Save dialog that was asked for', async ({ page, pedal }) => {
  await fakeGemini(page, [
    call('edit_preset', { changes: [{ kind: 'volume', value: 50 }] }),
    { status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '600s' }] } } },
  ]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'ratt body talk rhythm, save it to P43');
  const save = page.getByRole('dialog', { name: 'Save to a preset slot' });
  await expect(save).toBeVisible();
  await expect(save.getByLabel('Slot')).toHaveValue('42');
  await save.getByRole('button', { name: 'Cancel' }).click();
});

test('a paid provider added with its key answers first, with the model picked from its list', async ({ page, pedal }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route('https://api.openai.com/**', async (route: Route) => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'gpt-9' }, { id: 'tts-1' }, { id: 'gpt-9-mini' }] } });
    requests.push({ ...route.request().postDataJSON(), auth: route.request().headers().authorization });
    return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: 'From the paid model.' } }], usage: { prompt_tokens: 1500, completion_tokens: 150 } } });
  });
  await fakeGroq(page, []);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addGroqKey(page);
  await panel(page).getByRole('button', { name: 'Keys' }).click();
  const paidSection = panel(page).getByRole('region', { name: 'Paid providers' });
  await paidSection.getByLabel('Add a paid provider').selectOption('openai');
  await paidSection.getByLabel('OpenAI API key').fill('fake-openai-key-e2e-0000');
  await paidSection.getByRole('button', { name: 'Save key' }).click();
  const openai = paidSection.getByRole('group', { name: 'OpenAI' });
  await expect(openai.getByLabel('Model')).toHaveValue('gpt-9-mini');
  await expect(openai.getByLabel('Model').locator('option')).toHaveText(['gpt-9', 'gpt-9-mini']);
  await openai.getByLabel('Model').selectOption('gpt-9');
  await panel(page).getByRole('button', { name: 'Back to the chat' }).click();

  await ask(page, 'black album rhythm tone');
  await expect(panel(page).getByText('From the paid model.')).toBeVisible();
  // 1,500 × $0.000001 + 150 × $0.000004 = $0.0021, from the price catalog.
  await expect(panel(page).getByText('Answered by OpenAI · gpt-9 · about $0.0021')).toBeVisible();
  await expect(panel(page).getByText('OpenAI · gpt-9: paid · about $0.0021 today (estimated)')).toBeVisible();
  expect(requests[0]).toMatchObject({ model: 'gpt-9', auth: 'Bearer fake-openai-key-e2e-0000' });
  expect(await page.evaluate(() => localStorage.getItem('pocket-master-editor.aiProviders.v1'))).toContain('"model":"gpt-9"');
  await expect(page.locator('body')).not.toContainText('fake-openai-key-e2e-0000');
});

test('Claude added as a paid provider answers through its own API, with the browser header', async ({ page, pedal }) => {
  const sent: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'claude-test-sonnet' }, { id: 'claude-test-haiku' }] } });
    sent.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'From Claude.' }] } });
  });
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  const paidSection = panel(page).getByRole('region', { name: 'Paid providers' });
  await paidSection.getByLabel('Add a paid provider').selectOption('anthropic');
  await paidSection.getByLabel('Claude (Anthropic) API key').fill('fake-anthropic-key-e2e-0000');
  await paidSection.getByRole('button', { name: 'Save key' }).click();
  await ask(page, 'black album rhythm tone');
  await expect(panel(page).getByText('From Claude.')).toBeVisible();
  await expect(panel(page).getByText('Answered by Claude (Anthropic) · claude-test-haiku')).toBeVisible();
  // Its own usage page, and the privacy note names the provider the text really goes to.
  await expect(panel(page).getByRole('link', { name: 'Claude (Anthropic)' })).toHaveAttribute('href', 'https://console.anthropic.com/settings/limits');
  await expect(panel(page).getByText(/go to the provider of your key \(Claude \(Anthropic\)\)/)).toBeVisible();
  expect(sent[0]!.headers['x-api-key']).toBe('fake-anthropic-key-e2e-0000');
  expect(sent[0]!.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(sent[0]!.body.model).toBe('claude-test-haiku');
});

test("the answer order is the person's, and rotation starts each new conversation with the next provider", async ({ page, pedal }) => {
  await page.route('https://api.openai.com/**', async (route: Route) =>
    route.request().url().endsWith('/models')
      ? route.fulfill({ json: { data: [{ id: 'gpt-9-mini' }] } })
      : route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: 'From OpenAI.' } }] } }),
  );
  await fakeGroq(page, [groqSay('From Groq.'), groqSay('From Groq again.')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addGroqKey(page);
  await panel(page).getByRole('button', { name: 'Keys' }).click();
  const paidSection = panel(page).getByRole('region', { name: 'Paid providers' });
  await paidSection.getByLabel('Add a paid provider').selectOption('openai');
  await paidSection.getByLabel('OpenAI API key').fill('fake-openai-key-e2e-0000');
  await paidSection.getByRole('button', { name: 'Save key' }).click();
  const order = panel(page).getByRole('region', { name: 'Answer order' });
  await expect(order.getByRole('listitem').first()).toContainText('OpenAI');
  await order.getByRole('button', { name: 'Move Groq up' }).click();
  await expect(order.getByRole('listitem').first()).toContainText('Groq');
  await order.getByLabel(/Rotate/).check();
  await panel(page).getByRole('button', { name: 'Back to the chat' }).click();

  await ask(page, 'hi');
  await expect(panel(page).getByText('From Groq.')).toBeVisible();
  await panel(page).getByRole('button', { name: 'New conversation' }).click();
  await ask(page, 'hi again');
  await expect(panel(page).getByText('From OpenAI.')).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('pocket-master-editor.aiOrder.v1'), localStorage.getItem('pocket-master-editor.aiRotate.v1')])).toEqual(['["groq","openai"]', 'true']);
});

test('a paid Gemini key answers with the model picked from its list and the thorough request; the keys screen explains free and paid', async ({ page, pedal }) => {
  const sent: Record<string, unknown>[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route: Route) => {
    if (route.request().url().includes('/models')) {
      return route.fulfill({
        json: {
          models: [
            { name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-9-pro', supportedGenerationMethods: ['generateContent'] },
          ],
        },
      });
    }
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'From paid Gemini.' }] }] } });
  });
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await expect(panel(page).getByRole('note', { name: /Free keys: no cost/ })).toBeVisible();
  const paidSection = panel(page).getByRole('region', { name: 'Paid providers' });
  await expect(paidSection.getByRole('note', { name: /Paid keys: you pay the provider/ })).toBeVisible();
  await paidSection.getByLabel('Add a paid provider').selectOption({ label: 'Google Gemini (paid)' });
  await paidSection.getByLabel('Google Gemini (paid) API key').fill('fake-gemini-key-e2e-paid');
  await paidSection.getByRole('button', { name: 'Save key' }).click();
  await ask(page, 'black album rhythm tone');
  await expect(panel(page).getByText('From paid Gemini.')).toBeVisible();
  await expect(panel(page).getByText('Answered by Google Gemini (paid) · gemini-9-pro')).toBeVisible();
  expect(sent[0]).toMatchObject({ model: 'gemini-9-pro' });
  expect(String(sent[0]!.system_instruction)).toContain('actual rig');
  expect(JSON.stringify(sent[0]!.input)).toContain('Chorus with depth, rate and tone');
});

test('keys can be kept for this session only, and all forgotten at once', async ({ page, pedal }) => {
  await fakeGemini(page, []);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await panel(page).getByLabel('Remember keys on this device').uncheck();
  await addKey(page);
  const stored = () => page.evaluate(() => [localStorage.getItem('pocket-master-editor.geminiKey.v1'), sessionStorage.getItem('pocket-master-editor.geminiKey.v1') !== null]);
  expect(await stored()).toEqual([null, true]);
  await panel(page).getByRole('button', { name: 'Keys' }).click();
  await panel(page).getByRole('button', { name: 'Forget all keys' }).click();
  expect(await stored()).toEqual([null, false]);
  await expect(geminiSetup(page).getByLabel('Gemini API key')).toBeVisible();
});

for (const reduced of [false, true]) {
  test(`while the assistant works a status bubble shows a turning dial (${reduced ? 'reduced motion' : 'normal motion'}) and goes away with the answer`, async ({ page, pedal }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('https://generativelanguage.googleapis.com/**', async (route: Route) => {
      if (route.request().url().includes('/models')) return route.fulfill({ json: { models: [] } });
      await gate;
      return route.fulfill({ json: say('Done.').body });
    });
    await connect(page, pedal);
    await openDock(page, 'AI Assistant');
    await addKey(page);
    await ask(page, 'anything');
    const busy = panel(page).getByRole('status').filter({ hasText: 'Working on it…' });
    await expect(busy).toBeVisible();
    const dial = busy.locator('svg.assistant-busy-dial');
    await expect(dial).toHaveAttribute('aria-hidden', 'true');
    const animation = () => dial.evaluate((el) => getComputedStyle(el).animationName);
    expect(await animation()).toBe(reduced ? 'busy-pulse' : 'spin');
    await expect(busy.getByText(/^\d+ s$/)).toBeVisible({ timeout: 6000 });
    release();
    await expect(panel(page).getByText('Done.')).toBeVisible();
    await expect(busy).toBeHidden();
  });
}

test('replies render bold and lists instead of raw Markdown, and never as HTML', async ({ page, pedal }) => {
  await fakeGemini(page, [say('**Amp:** Calif DualM\n- Gain 70\n- Bass 40\n<img src=x onerror=alert(1)>')]);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await addKey(page);
  await ask(page, 'hi');
  const reply = panel(page).locator('.assistant-message.is-assistant .md');
  await expect(reply.locator('strong')).toHaveText('Amp:');
  await expect(reply.locator('li')).toHaveText(['Gain 70', 'Bass 40']);
  await expect(reply.locator('img')).toHaveCount(0);
  await expect(reply).toContainText('<img src=x onerror=alert(1)>');
});

test('the Gemini free-plan privacy sentence only shows when a Google key is in play', async ({ page, pedal }) => {
  await fakeGroq(page, []);
  await connect(page, pedal);
  await openDock(page, 'AI Assistant');
  await expect(panel(page).locator('p.muted.small', { hasText: 'go to the provider of your key' })).toContainText("On Gemini's free plan");
  await addGroqKey(page);
  await expect(panel(page).locator('p.muted.small', { hasText: 'go to the provider of your key' })).not.toContainText('Gemini');
});
