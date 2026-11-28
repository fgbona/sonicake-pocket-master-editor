/**
 * Screenshots of the workstation look for the owner's review, only when WS_SHOTS names a folder:
 * `WS_SHOTS=/tmp/shots npx playwright test e2e/workstation-shots.spec.ts`. Simulated pedals only.
 */
import type { Page } from '@playwright/test';
import { blockPanel, connectMatribox, test } from './matribox-fixtures.ts';
import { connect, test as pmTest } from './fixtures.ts';

const dir = process.env.WS_SHOTS;
const theme = (page: Page, t: 'dark' | 'light') => page.addInitScript((v) => localStorage.setItem('pocket-master-editor.theme', v), t);

/** An edit on the DRV, so the dirty dots and the sync chip show. */
async function edited(page: Page) {
  const drive = await blockPanel(page, 2, 'DRV');
  await drive.getByRole('slider', { name: 'Gain' }).and(page.locator('[aria-disabled="false"]')).focus();
  await page.keyboard.press('ArrowUp');
  await page.getByText('Edited · not stored in 17C').waitFor();
}

for (const t of ['dark', 'light'] as const) {
  test(`Matribox shell 1440x900, ${t}`, async ({ page }) => {
    test.skip(!dir, 'WS_SHOTS not set');
    await theme(page, t);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connectMatribox(page);
    await edited(page);
    await page.screenshot({ path: `${dir}/mb-1440-${t}.png` });
    // The DRV has three knobs: the panel fills with its gear and model beside them.
    await page.locator('section.editor').screenshot({ path: `${dir}/mb-1440-${t}-block-3knobs.png` });
    await page.getByRole('tab', { name: 'Global & EQ' }).click();
    await page.screenshot({ path: `${dir}/mb-1440-${t}-dock-global.png` });
    await page.getByRole('tab', { name: 'Clones & IRs' }).click();
    await page.screenshot({ path: `${dir}/mb-1440-${t}-dock-clones.png` });
    await page.getByRole('tab', { name: 'Controls' }).click();
    await page.screenshot({ path: `${dir}/mb-1440-${t}-dock-controls.png` });
  });
}

test('Matribox shell at 1280x720 (the e2e default)', async ({ page }) => {
  test.skip(!dir, 'WS_SHOTS not set');
  await page.setViewportSize({ width: 1280, height: 720 });
  await connectMatribox(page);
  await page.screenshot({ path: `${dir}/mb-1280x720.png` });
});

test('Matribox stacked at 1024', async ({ page }) => {
  test.skip(!dir, 'WS_SHOTS not set');
  await page.setViewportSize({ width: 1024, height: 768 });
  await connectMatribox(page);
  await edited(page);
  await page.screenshot({ path: `${dir}/mb-1024.png` });
});

test('Matribox on a phone', async ({ page }) => {
  test.skip(!dir, 'WS_SHOTS not set');
  await page.setViewportSize({ width: 390, height: 844 });
  await connectMatribox(page);
  await page.screenshot({ path: `${dir}/mb-phone.png` });
  await page.screenshot({ path: `${dir}/mb-phone-full.png`, fullPage: true });
});

pmTest('Pocket Master shell 1440x900, dark', async ({ page, pedal }) => {
  pmTest.skip(!dir, 'WS_SHOTS not set');
  await page.setViewportSize({ width: 1440, height: 900 });
  await connect(page, pedal);
  await page.screenshot({ path: `${dir}/pm-1440-dark.png` });
});
