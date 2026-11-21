/**
 * Read-only diagnostic for a session with the real pedal: checks the USB port is quiet, sends every
 * known read query, and looks for a firmware version in the replies (issue #101). With --scan it
 * also tries the query kinds nobody has mapped (GET frames only, one at a time). Everything sent
 * and received goes to ~/.pocket-master-editor/probe-<time>.txt.
 *
 *   node apps/mcp/scripts/probe-pedal.ts [--scan]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReadOnly, parseFrame, PocketMasterLink, Query, queryFrame, toHex, type QueryKind } from '@pocket-master/core';

const PORT_NAME = /pocket\s*master/i;
const QUIET_MS = 3000;
const SCAN_WAIT_MS = 600;
/** The tested firmware, as text and as bytes; other versions show up through the generic pattern. */
const TESTED = [1, 3, 3];

/** Places in a reply that could hold a firmware version: "x.y.z" text or the tested version's bytes. */
export function versionCandidates(payload: Uint8Array): string[] {
  const found: string[] = [];
  const text = Array.from(payload, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '\0')).join('');
  for (const m of text.matchAll(/[vV]?\d{1,2}\.\d{1,2}(\.\d{1,3})?/g)) found.push(`text "${m[0]}" at byte ${m.index}`);
  for (let i = 0; i + TESTED.length <= payload.length; i++) {
    if (TESTED.every((b, j) => payload[i + j] === b)) found.push(`bytes 01 03 03 at byte ${i}`);
  }
  return found;
}

async function main(scan: boolean) {
  const { Input, Output } = await import('@julusian/midi');
  const input = new Input();
  const output = new Output();
  const port = (p: { getPortCount(): number; getPortName(i: number): string }) => {
    const i = Array.from({ length: p.getPortCount() }, (_, k) => p.getPortName(k)).findIndex((n) => PORT_NAME.test(n));
    if (i < 0) throw new Error('No Pocket Master MIDI port: plug the pedal in by USB and close other editors.');
    return i;
  };
  const lines: string[] = [];
  const say = (line: string) => { console.log(line); lines.push(line); };
  let receiver: ((bytes: Uint8Array) => void) | null = null;
  input.ignoreTypes(false, true, true);
  input.on('messageBuffer', (_t: number, m: Buffer) => receiver?.(new Uint8Array(m)));
  input.openPort(port(input));
  output.openPort(port(output));
  const send = (bytes: Uint8Array) => {
    if (!isReadOnly(bytes)) throw new Error('blocked: the probe only sends read queries');
    output.sendMessage(Buffer.from(bytes));
  };
  try {
    // Another editor on the port answers and steals replies (lesson of 2026-11-20).
    let stray = 0;
    receiver = () => void stray++;
    await new Promise((r) => setTimeout(r, QUIET_MS));
    say(`Quiet port check: ${stray} unsolicited message(s) in ${QUIET_MS / 1000} s${stray ? ' - close other editors (SonicMaster, browser tabs) and run again' : ''}`);
    if (stray) return;

    const link = new PocketMasterLink({ send, listen: (r) => void (receiver = r) }, (e) => lines.push(`${e.dir} ${e.hex}${e.note ? `  (${e.note})` : ''}`));
    for (const [name, kind] of Object.entries(Query)) {
      try {
        const { payload } = await link.request(kind);
        const hits = versionCandidates(payload);
        say(`${name} (12 ${kind.toString(16).padStart(2, '0')}): ${payload.length} bytes${hits.length ? ` - VERSION? ${hits.join('; ')}` : ''}`);
      } catch (error) {
        say(`${name}: no reply (${(error as Error).message})`);
      }
    }
    link.close();

    if (scan) {
      const known = new Set<number>(Object.values(Query));
      for (let kind = 0; kind < 0x80; kind++) {
        if (known.has(kind)) continue;
        const replies: Uint8Array[] = [];
        receiver = (bytes) => replies.push(bytes);
        const frame = queryFrame(kind as QueryKind);
        lines.push(`TX ${toHex(frame)}  (scan 12 ${kind.toString(16).padStart(2, '0')})`);
        send(frame);
        await new Promise((r) => setTimeout(r, SCAN_WAIT_MS));
        for (const bytes of replies) {
          lines.push(`RX ${toHex(bytes)}`);
          let payload = bytes;
          try { payload = parseFrame(bytes).payload; } catch { /* keep the raw bytes */ }
          const hits = versionCandidates(payload);
          say(`scan 12 ${kind.toString(16).padStart(2, '0')}: reply of ${payload.length} bytes${hits.length ? ` - VERSION? ${hits.join('; ')}` : ''}`);
        }
      }
    }
  } finally {
    receiver = null;
    input.closePort();
    output.closePort();
    const dir = process.env.POCKET_MASTER_HOME ?? join(homedir(), '.pocket-master-editor');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `probe-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    writeFileSync(file, `${lines.join('\n')}\n`);
    console.log(`\nFull log: ${file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.includes('--scan')).catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
