#!/usr/bin/env node
/**
 * Writes packages/core/src/matribox/models.json, the built-in functional map of the Matribox II Pro
 * models, from a local copy of the official editor's alg_data.json (never committed, never shipped):
 *
 *   node scripts/matribox-map.mjs ~/Downloads/alg_data.json
 *
 * Only what the protocol needs is kept, in our own structure. Model names and descriptions are not
 * here: they are our own text, in packages/core/src/matribox/model-text.json.
 *
 * Schema (version 1):
 *
 *   {
 *     "version": 1,
 *     "modules": [                       // by module index
 *       {
 *         "module": "DRV",               // module code, as the unit's block types are known
 *         "index": 3,                    // module index in the protocol (DYN 0 … VOL 15)
 *         "models": [                    // by model index
 *           {
 *             "fxid": 50331648,          // model id the unit reads and writes
 *             "index": 0,                // position in the module's list
 *             "type": "OD",              // our category, groups the model menus ("" when none)
 *             "basedOn": "…",            // the real gear, plain text on one line ("" for originals): model-text.json's
 *                                        // `gear` when set, else the cleaned origin, see gear()
 *             "params": [                // by id
 *               {
 *                 "id": 0,               // parameter slot (index of the preset's 15 values)
 *                 "label": "Gain",       // generic control name
 *                 "min": 0, "max": 100, "step": 1, "default": 50,
 *                 "options": ["Off", "On"]   // only for a switch or a list, one label per step
 *               }
 *             ]
 *           }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Parameter units (ms, Hz, ...) are not here: they live in units.json next to this file, written by
 * hand and keyed "MODULE:Label" (or "MODULE:fxid:Label"), so a re-run of this script keeps them.
 *
 * Never emitted: the source's descriptions, parameter help, notes, legal notice block or model
 * display names, nor trademark signs. The output is checked against this schema: any key outside
 * it, or a trademark sign anywhere, and the script refuses to write.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'core', 'src', 'matribox');
const OUT = join(DIR, 'models.json');
const TEXT = join(DIR, 'model-text.json');

/** The only keys models.json may hold: anything else from the source (texts, names, notes) is refused. */
export const ALLOWED_KEYS = ['version', 'modules', 'module', 'index', 'models', 'fxid', 'type', 'basedOn', 'params', 'id', 'label', 'min', 'max', 'step', 'default', 'options'];
/** The registered and trademark signs. */
export const TRADEMARK_SIGNS = /[\u00ae\u2122]/g;
/** Origins that are not real gear: the source's own algorithms, IR files and another maker's products. */
export const NOT_GEAR = /^original\b|binary ir|ampero|xtomp|gp-?100/i;

const fail = (message) => {
  throw new Error(`matribox-map: ${message}`);
};

/** One line of plain text: first line only, no trademark signs, spaces collapsed. */
const clean = (value) =>
  String(value ?? '')
    .split('\n')[0]
    .replace(TRADEMARK_SIGNS, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\)/g, ')')
    .trim();

/**
 * The real gear a model is based on, as plain text: no trademark signs or "*", without the other
 * maker's product names ("Ampero Name: …", "XTOMP/Ampero Name: …"), on one line. None ('') for
 * the source's own algorithms ("Original…"), a bare number or an IR file name ("… IR Cab: 39"),
 * anything still naming another maker's product (NOT_GEAR) and text in another script.
 */
export function gear(value) {
  const text = String(value ?? '')
    .replace(TRADEMARK_SIGNS, '')
    .replace(/\*/g, '')
    .split(/(?:XTOMP\/)?Ampero Name:/i)[0];
  const line = clean(text.replace(/\s*\n\s*/g, ' ')).replace(/\s*\/$/, '');
  return /[a-z]/i.test(line) && !NOT_GEAR.test(line) && !/[^\p{Script=Latin}\p{Script=Common}]/u.test(line) ? line : '';
}

/** Cabinet sizes as " 4 x 12”" become 4x12"; "/" means none. */
const category = (value) => {
  const text = clean(value)
    .replace(/\s*x\s*/i, 'x')
    .replace(/[”″]/g, '"');
  return text === '/' ? '' : text;
};

const number = (value, path) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) fail(`${path} is not a number: ${JSON.stringify(value)}`);
  return n;
};

const integer = (value, path) => {
  const n = number(value, path);
  if (!Number.isInteger(n)) fail(`${path} is not an integer: ${JSON.stringify(value)}`);
  return n;
};

/** The labels of a switch (widgetType 1, "Off/On") or a list (2, "A, B, C"), when one per step. */
function options(widget, min, max, step) {
  if (widget.widgetType !== 1 && widget.widgetType !== 2) return undefined;
  const labels = String(widget.valueRange ?? '')
    .split(widget.widgetType === 1 ? '/' : ',')
    .map(clean);
  return labels.length === Math.round((max - min) / step) + 1 && labels.every(Boolean) ? labels : undefined;
}

function param(widget, path) {
  const [min, max, step, def] = [number(widget.min, `${path}.min`), number(widget.max, `${path}.max`), number(widget.step, `${path}.step`), number(widget.defaultValue, `${path}.defaultValue`)];
  if (step <= 0) fail(`${path}.step must be greater than 0`);
  if (min > max || def < min || def > max) fail(`${path} is out of range (min ${min}, max ${max}, default ${def})`);
  const label = clean(widget.name);
  if (!label) fail(`${path} has no control name`);
  const opts = options(widget, min, max, step);
  return { id: integer(widget.ID, `${path}.ID`), label, min, max, step, default: def, ...(opts ? { options: opts } : {}) };
}

/** `own` is our text for the model (model-text.json): its `gear`, when set, wins over the source's origin. */
function model(alg, path, own) {
  const basedOn = own?.gear ? clean(own.gear) : gear(alg.origin);
  const params = (alg.widget ?? []).map((w, i) => param(w, `${path}.widget[${i}]`)).sort((a, b) => a.id - b.id);
  return {
    fxid: integer(alg.fxid, `${path}.fxid`),
    index: integer(alg.index, `${path}.index`),
    type: category(alg.type),
    basedOn,
    params,
  };
}

/** Throws when `value` has a key outside the schema or a trademark sign anywhere. */
export function assertClean(value, path = 'map') {
  if (typeof value === 'string') {
    if (value.search(TRADEMARK_SIGNS) >= 0) fail(`${path} contains a trademark sign`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertClean(v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (!ALLOWED_KEYS.includes(key)) fail(`${path}.${key} is not a field of the map`);
      assertClean(v, `${path}.${key}`);
    }
  }
}

/** The functional map of a parsed alg_data.json, in our schema; `text` is model-text.json, by "MODULE:fxid". */
export function buildMap(source, text = {}) {
  if (!Array.isArray(source?.Modules)) fail('the input has no Modules array: is it alg_data.json?');
  const modules = source.Modules.map((m, i) => {
    const code = clean(m.name);
    if (!/^[A-Z]+$/.test(code)) fail(`Modules[${i}].name is not a module code: ${JSON.stringify(m.name)}`);
    const models = (m.alg ?? []).map((a, j) => model(a, `Modules[${i}].alg[${j}]`, text[`${code}:${a.fxid}`])).sort((a, b) => a.index - b.index);
    return { module: code, index: integer(m.index, `Modules[${i}].index`), models };
  }).sort((a, b) => a.index - b.index);
  const map = { version: 1, modules };
  assertClean(map);
  return map;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: node scripts/matribox-map.mjs <path to alg_data.json>');
    process.exit(2);
  }
  const map = buildMap(JSON.parse(readFileSync(input, 'utf8')), JSON.parse(readFileSync(TEXT, 'utf8')));
  writeFileSync(OUT, `${JSON.stringify(map, null, 1)}\n`);
  const models = map.modules.reduce((n, m) => n + m.models.length, 0);
  console.log(`wrote ${OUT}: ${map.modules.length} modules, ${models} models`);
}
