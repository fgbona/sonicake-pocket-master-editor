/**
 * A block panel's controls line up: in each visual row the knob dials share one top, the labels one
 * top, and a switch or selector sits centred on the dial row. Knobs with a range hint ("0 … 500")
 * used to sit higher than the ones without. KNOB_SHOTS=<folder> also saves a picture of each panel.
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { connectMatribox, expect, test } from './matribox-fixtures.ts';

const SHOTS = process.env.KNOB_SHOTS;
const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
/** The dial's height: a switch or selector is centred on a dial this tall. */

interface Item {
  top: number;
  dial: number | null;
  label: number;
  /** Vertical centre of a switch or selector, null for a knob. */
  control: number | null;
  hint: boolean;
  /** The dial's height: the workstation draws bigger dials in the block panel than on a phone. */
  dialHeight: number;
}

/** Each control of the panel with the tops that matter. */
const items = (panel: Locator): Promise<Item[]> =>
  panel.locator('.editor-params > :is(.knob, .editor-toggle)').evaluateAll((els) =>
    els.map((el) => {
      const dial = el.querySelector('.knob-dial')?.getBoundingClientRect() ?? null;
      const control = el.querySelector('.switch, .param-select')?.getBoundingClientRect() ?? null;
      return {
        top: el.getBoundingClientRect().top,
        dial: dial ? dial.top : null,
        label: el.querySelector('.knob-label')!.getBoundingClientRect().top,
        control: control ? control.top + control.height / 2 : null,
        hint: !!el.querySelector('.knob-hint'),
        dialHeight: dial ? dial.height : 0,
      };
    }),
  );

/** Groups the controls into the visual rows the panel wrapped them into. */
const rows = (all: Item[]) => {
  const out: Item[][] = [];
  for (const item of [...all].sort((a, b) => a.top - b.top)) {
    const row = out.find((r) => Math.abs(r[0]!.top - item.top) < 20);
    if (row) row.push(item);
    else out.push([item]);
  }
  return out;
};

const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

async function expectAligned(panel: Locator, name: string) {
  const all = await items(panel);
  expect(all.length, `${name} has controls`).toBeGreaterThan(0);
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/${name}.png` });
  for (const row of rows(all)) {
    expect(spread(row.map((i) => i.label)), `${name}: labels of a row share a top`).toBeLessThanOrEqual(1);
    const dials = row.flatMap((i) => (i.dial === null ? [] : [i.dial]));
    expect(spread(dials), `${name}: dials of a row share a top`).toBeLessThanOrEqual(1);
    const height = row.find((i) => i.dial !== null)?.dialHeight ?? 0;
    const centre = dials.length ? dials[0]! + height / 2 : null;
    for (const i of row) if (i.control !== null && centre !== null) expect(Math.abs(i.control - centre), `${name}: control on the dial row`).toBeLessThanOrEqual(1);
  }
  return all;
}

const pressWith = (phone: boolean) => (target: Locator) => (phone ? target.tap() : target.click());

async function addBlock(page: Page, module: string, press: ReturnType<typeof pressWith>) {
  const add = page.getByRole('button', { name: 'Add a block…' });
  await add.scrollIntoViewIfNeeded();
  await press(add);
  // The type list by keyboard: its later options sit below a phone sheet's fold.
  const types = page.getByRole('listbox', { name: 'Add a block: type' });
  await expect(types).toBeFocused();
  const option = types.getByRole('option', { name: module, exact: true });
  for (let i = 0; i < 20 && !((await option.getAttribute('class')) ?? '').includes('is-active'); i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const models = page.getByRole('listbox', { name: `Add a block: ${module} model` });
  await expect(models).toBeFocused();
  await page.keyboard.press('ArrowDown'); // "Back to block types" comes first
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tiles .tile-label').filter({ hasText: module })).toHaveCount(1);
  await expect(page.getByRole('listbox', { name: /^Add a block/ })).toHaveCount(0);
}

async function checkPanels(page: Page, label: string) {
  await connectMatribox(page);
  const press = pressWith(label === 'phone');
  await addBlock(page, 'EQ', press);
  const found: Item[] = [];
  for (const [position, module] of [
    [1, 'DYN'],
    [2, 'DRV'],
    [5, 'RVB'],
    [7, 'EQ'],
  ] as const) {
    await press(page.getByRole('button', { name: new RegExp(`^Edit ${position}\\. ${module}:`) }));
    const panel = page.getByRole('region', { name: `${position}. ${module} block` });
    await expect(panel.locator('.editor-params')).toBeVisible();
    found.push(...(await expectAligned(panel, `${label}-${module}`)));
  }
  // The check means something only when the panels mix knobs with and without a hint, and hold a switch or selector.
  expect(found.some((i) => i.hint)).toBe(true);
  expect(found.some((i) => i.dial !== null && !i.hint)).toBe(true);
  expect(found.some((i) => i.control !== null)).toBe(true);
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test('knob dials and labels line up in a block panel', ({ page }) => checkPanels(page, 'desktop'));
});

test.describe('phone', () => {
  test.use(pixel);
  test('knob dials and labels line up in a block panel on a phone', ({ page }) => checkPanels(page, 'phone'));
});
