import { test, expect, openDock } from './fixtures.ts';
import type { Page } from '@playwright/test';
import { en, pt } from '../lib/messages.ts';
import { openAssistantChat } from './assistant-chat.ts';

// A Brazilian browser gets the Portuguese UI; nothing on it should be left in English.
test.use({ locale: 'pt-BR' });

const words = (s: string) =>
  s
    .replace(/\{\w+\}/g, ' ')
    .toLowerCase()
    .match(/[a-zà-ú]{4,}/g) ?? [];
const ptWords = new Set(Object.values(pt).flatMap(words));
/** Words only the English messages use ("connect", "preset" is in both): a sign of an untranslated text. */
const englishOnly = new Set(
  Object.values(en)
    .flatMap(words)
    .filter((w) => !ptWords.has(w)),
);

/**
 * Visible text and accessible names, without the pedal's own data (preset, model and parameter names, quoted names, what the AI and the person wrote)
 * and the SysEx log's lines, which describe the protocol in English on purpose.
 */
function pageText(page: Page) {
  return page.evaluate(() => {
    const parts = [document.body.innerText];
    for (const el of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
      for (const a of ['aria-label', 'title', 'placeholder', 'alt']) parts.push(el.getAttribute(a) ?? '');
    }
    const data = [
      ...document.querySelectorAll('.sidebar-name, .picker-name, .log-line, .editor-params .knob-label, .editor-params .param-name, .changes-param, .assistant-message > p:first-child'),
    ].flatMap((e) => (e as HTMLElement).innerText.split('\n'));
    // "P41 · Current": a slot and the name stored in it.
    return parts
      .join('\n')
      .split('\n')
      .filter((line) => !data.includes(line) && !/^P\d\d\b/.test(line))
      .map((line) => line.replace(/“[^”]*”/g, ''));
  });
}

async function expectPortuguese(page: Page, where: string) {
  const found = (await pageText(page)).flatMap((line) =>
    words(line)
      .filter((w) => englishOnly.has(w))
      .map((w) => `${w}: ${line.trim()}`),
  );
  expect(found, `English left on the page (${where})`).toEqual([]);
}

test.use({ plugged: [] });

test('the whole editor speaks Portuguese', async ({ page, pedal }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expectPortuguese(page, 'before connecting');

  await page.evaluate(() => window.__midi.plug('Pocket Master'));
  await expect(page.getByRole('heading', { name: new RegExp(`P09\\s*${pedal.pedal.names[8]}`) })).toBeVisible();
  await openDock(page, pt['ws.rack.backups']);
  await page.getByRole('button', { name: pt['log.show'] }).click();
  await expectPortuguese(page, 'connected, with the SysEx log');

  await expectPortuguese(page, 'tone assistant, key setup');
  await openAssistantChat(
    page,
    {
      panel: pt['assistant.title'],
      keyRegion: pt['assistant.providerAria'].replace('{provider}', 'Google Gemini'),
      keyLabel: pt['assistant.keyLabel'],
      save: pt['assistant.saveKey'],
      input: pt['assistant.inputAria'],
      send: pt['assistant.send'],
      tab: pt['ws.rack.assistant'],
    },
    'Montei um Rectifier.',
  );
  await expectPortuguese(page, 'tone assistant, chat');
  await page.locator('section.block-amp .picker-button').click();
  await expectPortuguese(page, 'live edit, AMP menu open');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: pt['action.save'] }).click();
  await expect(page.getByRole('dialog', { name: pt['save.title'] })).toBeVisible();
  await expectPortuguese(page, 'save dialog');
  await page.getByRole('button', { name: pt['action.cancel'] }).click();

  await page.getByRole('button', { name: pt['settings.open'] }).click();
  await expect(page.getByRole('region', { name: pt['settings.title'] })).toBeVisible();
  await expectPortuguese(page, 'global options');
});
