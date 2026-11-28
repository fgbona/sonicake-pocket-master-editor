/**
 * Opens the tone assistant's chat with a simulated Gemini (nothing goes to Google): a key is saved
 * and one answer changes the amp, so the chat shows a message, "What changed" and the usage meter.
 */
import { expect, type Page } from '@playwright/test';
import { openDock } from './fixtures.ts';

export async function openAssistantChat(page: Page, labels: { keyRegion: string; keyLabel: string; save: string; input: string; send: string; panel: string; tab?: string }, reply: string) {
  const replies = [
    { status: 'requires_action', steps: [{ type: 'function_call', id: 'c1', name: 'edit_preset', arguments: { changes: [{ kind: 'model', block: 'AMP', model: 'Calif DualM' }] } }] },
    { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: reply }] }] },
  ];
  await page.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({ json: route.request().url().includes('/models') ? { models: [] } : replies.shift() }));
  await openDock(page, labels.tab ?? 'Assistant');
  const panel = page.getByRole('region', { name: labels.panel });
  const setup = panel.getByRole('region', { name: labels.keyRegion });
  await setup.getByLabel(labels.keyLabel).fill('fake-gemini-key-e2e-0000');
  await setup.getByRole('button', { name: labels.save }).click();
  await panel.getByRole('textbox', { name: labels.input }).fill('Black Album');
  await panel.getByRole('button', { name: labels.send }).click();
  await expect(panel.getByText(reply)).toBeVisible();
}
