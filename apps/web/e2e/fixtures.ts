/**
 * A page whose Web MIDI (and Web Bluetooth) is fake: pedal ports wired to simulated pedals in this
 * process, so the editor runs its real connect, read, edit and save flows without hardware. Every
 * page of these tests gets the fake, so none can reach a real MIDI device.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { SysexPedal } from './sysex-pedal.ts';

/** What a simulated device answers one message with. */
export type Device = (bytes: Uint8Array) => Promise<Uint8Array[]>;

declare global {
  interface Window {
    __pedalSend(port: string, bytes: number[]): Promise<number[][]>;
    /** Plugs a pedal's ports in (fresh port objects, like after a power cycle) or pulls them out. */
    __midi: { plug(name: string): void; unplug(name: string): void; receive(name: string, bytes: number[]): void };
  }
}

export interface FakeMidiOptions {
  /** Pedal port names plugged in when the page opens. */
  readonly plugged: readonly string[];
  /** How many requestMIDIAccess calls are refused before one is allowed (a denied permission). */
  readonly denials: number;
}

/** Runs in the page before any of its scripts: replaces navigator.requestMIDIAccess and navigator.bluetooth. */
export function installFakeMidi({ plugged, denials }: FakeMidiOptions) {
  type Listener = ((e: { data: Uint8Array }) => void) | null;
  let serial = 0;
  const deliver = (replies: number[][], to: () => Listener) =>
    // One packet after the other, a few ms apart, like the USB link.
    replies.forEach((r, i) => setTimeout(() => to()?.({ data: Uint8Array.from(r) }), 5 + 5 * i));
  const access = { inputs: new Map<string, object>(), outputs: new Map<string, object>(), sysexEnabled: true, onstatechange: null as ((e: { port: object }) => void) | null };
  const ports = new Map<string, { input: { id: string; state: string }; output: { id: string; state: string }; listener: () => Listener }>();
  const plug = (name: string) => {
    serial += 1;
    let listener: Listener = null;
    const common = { manufacturer: 'Sonicake', state: 'connected', connection: 'open', name, open: async () => undefined, close: async () => undefined };
    const input = {
      ...common,
      id: `in-${name}-${serial}`,
      type: 'input',
      set onmidimessage(f: Listener) {
        listener = f;
      },
      get onmidimessage() {
        return listener;
      },
    };
    const output = {
      ...common,
      id: `out-${name}-${serial}`,
      type: 'output',
      send(bytes: ArrayLike<number>) {
        if (output.state !== 'connected') throw new DOMException('The port is disconnected.', 'InvalidStateError');
        void window.__pedalSend(name, Array.from(bytes)).then((replies) => deliver(replies, () => (input.state === 'connected' ? listener : null)));
      },
    };
    ports.set(name, { input, output, listener: () => listener });
    access.inputs.set(input.id, input);
    access.outputs.set(output.id, output);
    access.onstatechange?.({ port: input });
    access.onstatechange?.({ port: output });
  };
  const unplug = (name: string) => {
    const pair = ports.get(name);
    if (!pair) return;
    ports.delete(name);
    for (const port of [pair.input, pair.output]) {
      port.state = 'disconnected';
      access.inputs.delete(port.id);
      access.outputs.delete(port.id);
      access.onstatechange?.({ port });
    }
  };
  plugged.forEach(plug);
  // A message the device sends on its own (a footswitch pressed on it), not as an answer.
  const receive = (name: string, bytes: number[]) => {
    const pair = ports.get(name);
    if (pair) deliver([bytes], pair.listener);
  };
  window.__midi = { plug, unplug, receive };
  let refusals = denials;
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: async () => {
      if (refusals > 0) {
        refusals -= 1;
        throw new DOMException('Permission denied.', 'NotAllowedError');
      }
      return access;
    },
  });
  // A Bluetooth Pocket Master: BLE-MIDI framing (80 80 before each SysEx) over the same simulated pedal.
  const characteristic = new EventTarget() as EventTarget & Record<string, unknown>;
  characteristic.startNotifications = async () => undefined;
  characteristic.writeValueWithoutResponse = async (wire: Uint8Array) => {
    const replies = await window.__pedalSend('Pocket Master', Array.from(wire.subarray(2)));
    replies.forEach((r, i) =>
      setTimeout(
        () => {
          const event = Object.assign(new Event('characteristicvaluechanged'), {});
          Object.defineProperty(event, 'target', { value: { value: new DataView(Uint8Array.from([0x80, 0x80, ...r]).buffer) } });
          characteristic.dispatchEvent(event);
        },
        5 + 5 * i,
      ),
    );
  };
  const server = {
    connected: true,
    connect: async () => server,
    disconnect: () => {
      server.connected = false;
    },
    getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }),
  };
  const device = Object.assign(new EventTarget(), { name: 'Pocket Master', gatt: server });
  Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device } });
  // The dev server's indicator sits over the preset list; the published site has none.
  document.addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: 'nextjs-portal { display: none !important; }' })));
}

/** Wires the page's fake MIDI to simulated devices, by port name, before the page opens. */
export async function wireMidi(page: Page, devices: Readonly<Record<string, Device>>, options: FakeMidiOptions) {
  await page.exposeFunction('__pedalSend', async (port: string, bytes: number[]) => {
    const device = devices[port];
    return device ? (await device(Uint8Array.from(bytes))).map((f) => Array.from(f)) : [];
  });
  await page.addInitScript(installFakeMidi, options);
}

export const test = base.extend<{ plugged: readonly string[]; denials: number; pedal: SysexPedal }>({
  plugged: [['Pocket Master'], { option: true }],
  denials: [0, { option: true }],
  pedal: [
    async ({ page, plugged, denials }, use) => {
      const pedal = new SysexPedal();
      await wireMidi(page, { 'Pocket Master': (bytes) => pedal.receive(bytes) }, { plugged, denials });
      // The price catalog the assistant reads for paid answers: a small fixed one, never the network.
      await page.route('https://openrouter.ai/api/v1/models', (route) => route.fulfill({ json: { data: [{ id: 'openai/gpt-9', pricing: { prompt: '0.000001', completion: '0.000004' } }] } }));
      await use(pedal);
    },
    { auto: true },
  ], // always: a page here must never reach the real Web MIDI
});
export { expect };

/** The heading of the preset the simulated Pocket Master has loaded (P09). */
export const loadedPreset = (page: Page, pedal: SysexPedal) => page.getByRole('heading', { name: new RegExp(`P09\\s*${pedal.pedal.names[8]}`) });

/** Opens the editor, which finds the plugged-in Pocket Master by itself; returns once P09 is read. */
export async function connect(page: Page, pedal: SysexPedal) {
  await page.goto('/');
  await expect(loadedPreset(page, pedal)).toBeVisible();
}

/**
 * Opens a tab of the workstation dock (Assistant, Clones & IRs, Controls…) when the shell shows the
 * dock's tabs (1280 px and up); below that every panel is on the page already. Call it once the
 * pedal's preset shows.
 */
export async function openDock(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true });
  if (!(await tab.isVisible())) return;
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}
