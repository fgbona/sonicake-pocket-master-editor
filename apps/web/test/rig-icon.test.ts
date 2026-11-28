import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MB_CATALOG } from '@pocket-master/core';
import { hash, inkOn, luminance, RIG_CATEGORIES, RIG_PAINTS, rigCategory, rigIconSpec, textOn } from '../lib/rigIcon.ts';

const models = MB_CATALOG.modules.flatMap((m) => m.models.map((model) => ({ module: m.name, moduleIndex: m.index, model })));

test('every kind of gear is drawn for some model of the catalog', () => {
  const used = new Set(models.map((b) => rigCategory(b)));
  assert.deepEqual([...used].sort(), [...RIG_CATEGORIES].sort());
});

test('blocks map to the gear they are', () => {
  const block = (module: string, name = '', basedOn = '') => ({ module, model: { name, basedOn } });
  assert.equal(rigCategory(block('DYN', 'GATE-S')), 'gate');
  assert.equal(rigCategory(block('DYN', 'CMP4')), 'comp');
  assert.equal(rigCategory(block('WAH')), 'treadle');
  assert.equal(rigCategory(block('VOL')), 'treadle');
  assert.equal(rigCategory(block('AMP', 'X', 'Fender Twin Reverb')), 'combo');
  assert.equal(rigCategory(block('AMP', 'X', 'Marshall JCM800')), 'head');
  assert.equal(rigCategory(block('FXLOOP')), 'rack');
  assert.equal(rigCategory({ module: 'module 40', model: null }), 'rack');
});

test('a model always gets the same drawing, and models of a kind vary', () => {
  assert.deepEqual(rigIconSpec('drive', '3:42', 3), rigIconSpec('drive', '3:42', 3));
  assert.equal(hash('abc'), 0x1a47e90b);
  const drives = models.filter((b) => rigCategory(b) === 'drive').map((b) => rigIconSpec('drive', `${b.moduleIndex}:${b.model.fxid}`, b.model.params.length));
  assert.ok(new Set(drives.map((s) => s.body)).size >= 4, 'drive paints');
  assert.ok(new Set(drives.map((s) => s.footswitch)).size === 2, 'both switches');
});

test('knobs follow the parameter count, within the drawing', () => {
  assert.equal(rigIconSpec('drive', 'a', 0).knobs, 1);
  assert.equal(rigIconSpec('drive', 'a', 3).knobs, 3);
  assert.equal(rigIconSpec('drive', 'a', 12).knobs, 4);
  assert.equal(rigIconSpec('head', 'a', 6).knobs, 6);
  assert.equal(rigIconSpec('cab', 'a', 3).knobs, 0);
});

test('a cabinet counts its speakers from its name', () => {
  assert.equal(rigIconSpec('cab', 'a', 3, 'Tweed 4x10').speakers, 4);
  assert.equal(rigIconSpec('cab', 'a', 3, 'Black 2x12').speakers, 2);
  assert.equal(rigIconSpec('cab', 'a', 3, 'Brit 1x12').speakers, 1);
});

test('marks on a paint take the ink that reads on it', () => {
  assert.equal(inkOn('#d6c69a'), '#1c1c1e');
  assert.equal(inkOn('#33363b'), '#f5f5f7');
});

test('a module name printed on any paint (or grille, base, badge) reads at AA contrast', () => {
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  for (const paint of [...RIG_PAINTS, '#3a3a3c', '#2c2c2e', '#c7ccd1']) assert.ok(contrast(textOn(paint), paint) >= 4.5, `${textOn(paint)} on ${paint}`);
});
