import { test, expect, connect, openDock } from './fixtures.ts';
import type { Page } from '@playwright/test';

// The desktop app's AI connection, editor side. The desktop preload is faked here (the real one is
// apps/desktop/src/preload.ts): the test plays the app's local MCP server and calls the tools the
// editor serves, against the simulated pedal. The panel is desktop only.

type Result = { ok: boolean; text: string };
declare global {
  interface Window {
    /** The tool runner the editor handed to the fake preload. */
    __aiRun?: (name: string, args: unknown) => Promise<Result>;
    __aiTools?: readonly { name: string }[];
  }
}

/** Runs in the page before its scripts: a preload bridge like the desktop app's, with a masked token. */
function fakeDesktop() {
  let state = { enabled: false, port: null as number | null, defaultPort: 47830, maskedToken: null as string | null, lastRequestAt: null as number | null, error: null };
  const listeners = new Set<(s: typeof state) => void>();
  const set = (next: typeof state) => {
    state = next;
    for (const f of listeners) f(state);
    return Promise.resolve(state);
  };
  window.opensonicx = {
    ai: {
      state: () => Promise.resolve(state),
      setEnabled: (on: boolean) => set({ ...state, enabled: on, port: on ? 47830 : null, maskedToken: '••••••••••••Ab3x' }),
      regenerate: () => set({ ...state, maskedToken: '••••••••••••Zz9q' }),
      copy: () => Promise.resolve(true),
      onState: (f) => {
        listeners.add(f as (s: typeof state) => void);
        return () => listeners.delete(f as (s: typeof state) => void);
      },
      serve: (tools, run) => {
        window.__aiTools = tools;
        window.__aiRun = run;
        return () => {
          window.__aiRun = undefined;
        };
      },
    },
  } as Window['opensonicx'];
}

const panel = (page: Page) => page.getByRole('region', { name: 'AI connection' });
const amp = (page: Page) => page.locator('section.block-amp');
const run = (page: Page, name: string, args: unknown) => page.evaluate(([n, a]) => window.__aiRun!(n as string, a), [name, args] as const);

test('the web editor has no AI connection panel', async ({ page, pedal }) => {
  await connect(page, pedal);
  await openDock(page, 'Assistant');
  await expect(page.getByRole('region', { name: 'Tone assistant' })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test('desktop: off by default; turned on it shows the endpoint, the masked token and the Claude Code command', async ({ page, pedal }) => {
  await page.addInitScript(fakeDesktop);
  await connect(page, pedal);
  await openDock(page, 'Backups');
  const ai = panel(page);
  const toggle = ai.getByRole('checkbox', { name: 'Allow an AI client on this computer to connect' });
  await ai.locator('summary').click(); // folded while off
  await expect(toggle).not.toBeChecked();
  await expect(ai.getByText('http://127.0.0.1:47830/mcp')).toHaveCount(0);
  await toggle.check();
  await expect(ai.getByText('http://127.0.0.1:47830/mcp', { exact: true })).toBeVisible();
  await expect(ai.getByText('••••••••••••Ab3x', { exact: true })).toBeVisible();
  await expect(ai.getByText('claude mcp add --transport http opensonicx http://127.0.0.1:47830/mcp --header "Authorization: Bearer ••••••••••••Ab3x"')).toBeVisible();
  await expect(ai.getByText('No requests yet')).toBeVisible();
  await ai.getByRole('button', { name: 'Regenerate' }).click();
  await expect(ai.getByText('••••••••••••Zz9q', { exact: true })).toBeVisible();
  await toggle.uncheck();
  await expect(ai.getByText('http://127.0.0.1:47830/mcp', { exact: true })).toHaveCount(0);
});

test('desktop: an AI edit runs in the editor’s own session, shows at once and Undo takes it back', async ({ page, pedal }) => {
  await page.addInitScript(fakeDesktop);
  await connect(page, pedal);
  await expect.poll(() => page.evaluate(() => typeof window.__aiRun)).toBe('function');
  const tools = await page.evaluate(() => window.__aiTools!.map((t) => t.name));
  expect(tools).toEqual(expect.arrayContaining(['which_pedal', 'get_preset', 'edit_preset', 'save_preset', 'matribox_build_tone']));

  expect((await run(page, 'which_pedal', {})).text).toMatch(/Pocket Master connected/);
  expect((await run(page, 'matribox_get_preset', {})).text).toMatch(/no Matribox II Pro is connected/);
  const read = await run(page, 'get_preset', {});
  expect(read.ok).toBe(true);
  expect(read.text).toContain('P09');

  const edited = await run(page, 'edit_preset', { changes: [{ kind: 'model', block: 'AMP', model: 'Calif DualM' }] });
  expect(edited.ok, edited.text).toBe(true);
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'mesa');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(amp(page).locator('.face-amp')).toHaveAttribute('data-skin', 'marshall');
  await expect.poll(() => pedal.pedal.editBuffer.join()).toBe(pedal.pedal.slots[8]!.join());
});
