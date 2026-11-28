import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloneNameFromTitle } from '../lib/toneSearch.ts';

test('a short ASCII title keeps its dots', () => {
  assert.equal(cloneNameFromTitle('Fender 5.5'), 'Fender 5.5');
});

test('a long title is cut at 16 characters without a trailing space', () => {
  assert.equal(cloneNameFromTitle('Marshall JCM800 2203 Lead'), 'Marshall JCM800');
});

test('non-ASCII is dropped and whitespace collapsed', () => {
  assert.equal(cloneNameFromTitle('  Vox   AC30 ★ Top  Boost '), 'Vox AC30 Top Boo');
});

test('a title of only symbols comes out empty', () => {
  assert.equal(cloneNameFromTitle('★★★'), '');
});
