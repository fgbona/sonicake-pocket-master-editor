import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { connectMatribox, expect, test, openDock } from './matribox-fixtures.ts';

const NAM = new URL('../../../packages/core/test/fixtures/clo/ref_input.nam', import.meta.url);
const API = 'https://www.tone3000.com/api/v1';

const tone = (id: number, title: string, format: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  gear: format === 'ir' ? 'ir' : 'amp',
  format,
  makes: [],
  user: { username: 'tester' },
  models_count: 2,
  downloads_count: 1234,
  url: `https://www.tone3000.com/tones/${id}`,
  images: [],
  description: '',
  ...extra,
});

/** The TONE3000 API, answered here: nothing leaves the machine and no real token exists. */
async function mockTone3000(page: Page, searches: string[]) {
  await page.addInitScript(() => {
    localStorage.setItem('pocket-master-editor.tone3000', JSON.stringify({ accessToken: 'mock-token', refreshToken: null, expiresAt: Date.now() + 3_600_000 }));
  });
  await page.route(`${API}/tones/search**`, (route) => {
    const q = new URL(route.request().url()).searchParams;
    searches.push(`${q.get('query')}|${q.get('format')}|${q.get('gears') ?? ''}`);
    const tones = q.get('format') === 'ir' ? [tone(7, 'Big Cab IR', 'ir')] : [tone(1, 'Mock Plexi ★ Lead', 'nam')];
    return route.fulfill({ json: { data: tones, page: 1, total_pages: 1, total: tones.length } });
  });
  await page.route(`${API}/models**`, (route) =>
    route.fulfill({
      json: {
        data: [
          { id: 11, name: 'Clean', size: 'standard', model_url: 'https://www.tone3000.com/files/clean.nam', architecture_version: '1' },
          { id: 12, name: 'Crunch', size: 'standard', model_url: 'https://www.tone3000.com/files/crunch.nam', architecture_version: '1' },
        ],
      },
    }),
  );
  await page.route('https://www.tone3000.com/files/**', (route) => route.fulfill({ body: readFileSync(NAM) }));
  await page.route('https://raw.githubusercontent.com/skyggedans/SonicMaster/**', (route) => route.fulfill({ status: 404, body: 'not found' }));
}

test('searches TONE3000, picks a model and hands the capture to the Clones panel, sending nothing to the pedal', async ({ page, unit }) => {
  const searches: string[] = [];
  await mockTone3000(page, searches);
  await connectMatribox(page);
  await openDock(page, 'Clones & IRs');
  const search = page.getByRole('region', { name: 'Search TONE3000' });

  await search.getByRole('searchbox', { name: 'Search TONE3000' }).fill('plexi');
  await search.getByRole('combobox', { name: 'Gear type' }).selectOption('amp');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  const result = search.getByRole('listitem').filter({ hasText: 'Mock Plexi' });
  await expect(result).toContainText('by tester');
  await expect(result).toContainText('amp');
  await expect(result).toContainText('1234 downloads');
  expect(searches).toEqual(['plexi|nam|amp']);

  await result.getByRole('button', { name: /^Load Mock Plexi/ }).click();
  await result
    .getByRole('group', { name: 'Choose a model' })
    .getByRole('button', { name: /Crunch/ })
    .click();

  const clones = page.getByRole('region', { name: 'Clones', exact: true });
  await expect(clones.getByRole('textbox', { name: 'Name' })).toHaveValue('Mock Plexi Lead');
  await expect(clones.getByRole('combobox', { name: 'Slot' })).toHaveValue('5'); // the first empty CLONE slot of the simulated unit (CLONE 6)
  // The reference signal is blocked above, so the conversion stops here: still nothing written.
  await expect(clones.getByRole('alert')).toContainText('Could not download the reference DI');
  expect(unit.cloneUploads).toHaveLength(0);
});

test('IR results can be browsed but not loaded', async ({ page }) => {
  const searches: string[] = [];
  await mockTone3000(page, searches);
  await connectMatribox(page);
  await openDock(page, 'Clones & IRs');
  const search = page.getByRole('region', { name: 'Search TONE3000' });
  await search.getByRole('combobox', { name: 'Platform' }).selectOption('ir');
  await search.getByRole('searchbox', { name: 'Search TONE3000' }).fill('cab');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  const result = search.getByRole('listitem').filter({ hasText: 'Big Cab IR' });
  await expect(result).toContainText('IR: view only');
  await expect(result.getByRole('button')).toHaveCount(0);
  expect(searches).toEqual(['cab|ir|']);
});
