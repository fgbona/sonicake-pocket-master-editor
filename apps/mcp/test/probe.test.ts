import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionCandidates } from '../scripts/probe-pedal.ts';

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

test('versionCandidates finds a version as text or as the tested version\'s bytes', () => {
  assert.deepEqual(versionCandidates(Uint8Array.from([0x12, 0x30, ...ascii('V1.3.3'), 0])), ['text "V1.3.3" at byte 2']);
  assert.deepEqual(versionCandidates(Uint8Array.from([0x12, 0x10, 0x00, 1, 3, 3, 9])), ['bytes 01 03 03 at byte 3']);
  assert.deepEqual(versionCandidates(ascii('fw 2.0')), ['text "2.0" at byte 3']);
  assert.deepEqual(versionCandidates(Uint8Array.from([0x12, 0x41, 1, 3, 4])), []);
});
