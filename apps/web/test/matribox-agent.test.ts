import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matriboxLink, mbAssignments, mbReadDrumState, mbWriteDrum, parseMbPreset, type MbPreset, type TonePage } from '@pocket-master/core';
import { FakeMatribox } from '../../../packages/core/test/fake-matribox.ts';
import { FAKE_CATALOG } from '../../../packages/core/test/matribox-fake-catalog.ts';
import { askedToSaveMb, matriboxAgent, type MbAgentHost } from '../lib/matriboxAgent.ts';
import { cloneNameFromFile, firstEmptyClone, pickToneModel } from '../lib/cloneSource.ts';
import { requestTexts } from '../lib/assistant.ts';
import { mbTone, withTone, type MbTone } from '../lib/matriboxLibrary.ts';

const catalog = FAKE_CATALOG;

/** A host over plain state: apply sets the chain (slots in order), undo goes back one apply. */
function host() {
  const fake = new FakeMatribox();
  const unit = matriboxLink({ send: (b) => fake.send(b), listen: (r) => fake.listen(r ?? (() => undefined)) }, 1000);
  let preset: MbPreset = parseMbPreset(fake.editBuffer);
  const sent: Uint8Array[] = [];
  let current = 66;
  const past: MbPreset[] = [];
  const saves: [number, string][] = [];
  let tones: MbTone[] = [];
  const clones: { slot: number; name: string; source: unknown }[] = [];
  const searches: string[] = [];
  let answer: 'uploaded' | 'cancelled' = 'uploaded';
  let signedIn = true;
  const page: TonePage = {
    tones: [
      { id: 7, title: 'Rectifier Crunch', gear: 'amp', format: 'nam', makes: [], creator: 'ana', modelsCount: 2, downloads: 5, url: 'https://www.tone3000.com/tones/7', image: null, description: '' },
    ],
    page: 1,
    totalPages: 1,
    total: 1,
  };
  const h: MbAgentHost = {
    snapshot: () => ({ current, preset, catalog }),
    apply: async (chain) => {
      past.push(preset);
      preset = { ...preset, chain: chain.map((b, slot) => ({ ...b, slot })) };
      return preset;
    },
    assign: async (frames) => {
      for (const frame of frames) {
        sent.push(frame);
        await unit.write(frame);
      }
      preset = parseMbPreset(fake.editBuffer);
      return preset;
    },
    undo: async () => {
      const last = past.pop();
      if (last) preset = last;
      return last !== undefined;
    },
    proposeSave: async (index, name) => {
      saves.push([index, name]);
      return 'saved';
    },
    cloneNames: () => ['Clone 1', 'Plexi', 'Clone 3', ...Array.from({ length: 7 }, (_, i) => `Clone ${i + 4}`)],
    proposeClone: async (p) => {
      clones.push(p);
      return answer;
    },
    tone3000: {
      signedIn: () => signedIn,
      find: async (query) => {
        searches.push(query);
        return page;
      },
    },
    drums: (change) => (change ? mbWriteDrum(unit, change) : mbReadDrumState(unit)),
    tones: () => tones,
    keepTone: async (name, notes) => {
      tones = withTone(tones, mbTone(preset, name, notes, `kept-${tones.length}`));
    },
  };
  return {
    h,
    fake,
    sent,
    saves,
    clones,
    searches,
    answer: (a: 'uploaded' | 'cancelled') => {
      answer = a;
    },
    signOut: () => {
      signedIn = false;
    },
    tones: () => tones,
    load: (n: number) => {
      current = n;
    },
    preset: () => preset,
  };
}

test('the first message carries the catalog and the loaded preset; later ones the preset only', () => {
  const agent = matriboxAgent(host().h);
  const first = requestTexts(agent, [], 'Black Album', 'English').first;
  assert.match(first, /^Loaded preset:\nName: Drive AD/);
  assert.match(first, /Models by module/);
  assert.match(first, /DRV: Fake Drive \(Imaginary Overdrive 808\)/);
  assert.match(first, /Request: Black Album\n\nAnswer in English\.$/);
  assert.doesNotMatch(first, /Time 20\.\.2000/);
  assert.match(agent.context(true), /Time 20\.\.2000/);
  assert.match(agent.instructions(false), /Matribox II Pro/);
  assert.ok(agent.instructions(true).length > agent.instructions(false).length);
});

test('build_tone replaces the chain in one step and answers with the preset as it now is', async () => {
  const s = host();
  const agent = matriboxAgent(s.h);
  const run = agent.runner();
  const watch = agent.watch('off');
  const r = await run('build_tone', {
    blocks: [
      { module: 'DRV', model: 'Fake Fuzz', params: [{ name: 'Fuzz', value: 80 }] },
      { module: 'AMP', model: 'Fake Plexi' },
    ],
  });
  assert.equal(r.ok, true);
  assert.match(r.text, /^Name: Drive AD\nChain: DRV → AMP\nDSP load \(estimate from the block types\): 18% of the unit's budget\n1\. DRV on Fake Fuzz \(based on Imaginary Fuzz Face\): Fuzz 80/);
  assert.equal(agent.acts.has('build_tone'), true);
  const changes = watch({ loaded: false, saved: false })!;
  assert.deepEqual(changes[0], { what: 'order', from: 'DYN DRV AMP CAB RVB VOL', to: 'DRV AMP' });

  const bad = await run('build_tone', { blocks: [{ module: 'DRV', model: 'Nope' }] });
  assert.deepEqual([bad.ok, bad.text], [false, 'Error: No DRV model "Nope". Models: Fake Drive, Fake Fuzz']);
  assert.equal(s.preset().chain.length, 2); // nothing sent
});

test('build_tone and edit_preset refuse a chain past the estimated DSP, sending nothing, and warn near it', async () => {
  const s = host();
  const run = matriboxAgent(s.h).runner();
  const before = s.preset();
  const amps = (n: number) => Array.from({ length: n }, () => ({ module: 'AMP', model: 'Fake Plexi' }));
  const heavy = await run('build_tone', { blocks: amps(11) }); // 11 x ~10%
  assert.equal(heavy.ok, false);
  assert.match(heavy.text, /^Error: the chain would be past the unit's DSP: estimated DSP load 110%.*heaviest: AMP ~10%/);
  assert.equal(s.preset(), before);
  const memory = await run('edit_preset', {
    changes: [
      { kind: 'add', module: 'CLONE', model: 'Clone 1' },
      { kind: 'add', module: 'IR', model: 'User IR 1' },
    ],
  });
  assert.equal(memory.ok, false);
  assert.match(memory.text, /3 CAB\/IR\/CLONE blocks; the Matribox II Pro has memory for 2/);
  assert.equal(s.preset(), before);
  const near = await run('build_tone', { blocks: amps(9) });
  assert.equal(near.ok, true);
  assert.match(near.text, /DSP load \(estimate from the block types\): 90%/);
  assert.match(near.text, /\n\nNote: estimated DSP load 90% .*near the unit's limit/);
  assert.match(matriboxAgent(s.h).instructions(false), /System overloaded/);
});

test('edit_preset, undo_edit, list_models and get_preset', async () => {
  const s = host();
  const run = matriboxAgent(s.h).runner();
  const r = await run('edit_preset', { changes: [{ kind: 'parameter', block: 'AMP', parameter: 'Gain', value: 65 }] });
  assert.match(r.text, /AMP on Fake Plexi \(based on Imaginary Plexi 50W\): Gain 65/);
  assert.match((await run('undo_edit', {})).text, /Gain 30/);
  assert.deepEqual(await run('undo_edit', {}), { ok: false, text: 'Error: there is nothing to undo.' });
  assert.match((await run('list_models', { modules: ['DLY'] })).text, /Time 20\.\.2000 \(default 20\)/);
  assert.match((await run('get_preset', {})).text, /^Name: Drive AD/);
  assert.deepEqual(await run('nope', {}), { ok: false, text: 'Error: unknown tool "nope"' });
});

test('save_preset only proposes the Save dialog, for a checked label and name', async () => {
  const s = host();
  const run = matriboxAgent(s.h).runner();
  assert.match((await run('save_preset', { slot: '12a', name: 'Black Album' })).text, /saved it to 12A "Black Album"/);
  assert.deepEqual(s.saves, [[44, 'Black Album']]);
  assert.equal((await run('save_preset', { slot: '61A', name: 'x' })).ok, false);
  assert.equal((await run('save_preset', { slot: '1A', name: 'Ação' })).ok, false);
});

test('once the person loads another preset, the tools refuse to change it until get_preset', async () => {
  const s = host();
  const agent = matriboxAgent(s.h);
  const run = agent.runner();
  const watch = agent.watch('off');
  s.load(3);
  const refused = await run('edit_preset', { changes: [{ kind: 'block', block: 'DRV', on: true }] });
  assert.equal(refused.ok, false);
  assert.match(refused.text, /changed to 1D/);
  assert.equal(watch({ loaded: false, saved: false }), undefined);
  await run('get_preset', {});
  assert.equal((await run('edit_preset', { changes: [{ kind: 'block', block: 'DRV', on: true }] })).ok, true);
});

test('a message asking to save in a slot opens the Save dialog itself', () => {
  assert.equal(askedToSaveMb('salva no 12A'), 44);
  assert.equal(askedToSaveMb('save it to 1d please'), 3);
  assert.equal(askedToSaveMb('more gain on 12A'), null);
  assert.equal(askedToSaveMb('save it to 61A'), null);
  const s = host();
  assert.equal(matriboxAgent(s.h).offerSave('grave no 2B'), '2B');
  assert.deepEqual(s.saves, [[5, 'Drive AD']]);
});

test('keep_tone keeps the sound, the next first message lists it, and load_saved_tone brings it back as one step', async () => {
  const s = host();
  const agent = matriboxAgent(s.h);
  const run = agent.runner();
  assert.equal((await run('list_saved_tones', {})).text, 'No tones kept yet.');
  assert.doesNotMatch(agent.context(false), /Saved tones/);
  const kept = await run('keep_tone', { name: 'AD Crunch', notes: 'AC/DC, rhythm' });
  assert.equal(kept.ok, true);
  assert.deepEqual(
    s.tones().map((t) => [t.name, t.notes]),
    [['AD Crunch', 'AC/DC, rhythm']],
  );
  assert.match(agent.context(false), /Saved tones \(load_saved_tone\):\n- AD Crunch: AC\/DC, rhythm \[.*Imaginary Overdrive 808/);
  const original = s.preset().chain;
  await run('build_tone', { blocks: [{ module: 'AMP', model: 'Fake Plexi' }] });
  assert.equal(s.preset().chain.length, 1);
  const loaded = await run('load_saved_tone', { name: 'ad crunch' });
  assert.equal(loaded.ok, true);
  assert.match(loaded.text, /^Loaded the kept tone "AD Crunch"\.\n\nName: Drive AD/);
  assert.deepEqual(
    s.preset().chain.map((b) => [b.moduleIndex, b.fxid, b.on]),
    original.map((b) => [b.moduleIndex, b.fxid, b.on]),
  );
  assert.equal(agent.acts.has('load_saved_tone') && agent.acts.has('keep_tone'), true);
  const missing = await run('load_saved_tone', { name: 'Nope' });
  assert.equal(missing.ok, false);
  assert.match(missing.text, /no kept tone is called "Nope"\. Kept tones:\n- AD Crunch/);
  assert.equal((await run('keep_tone', { name: 'Way too long for a preset', notes: '' })).ok, false);
});

test('set_controls makes the tone live-ready: EXP on a parameter, a footswitch on a block, a quick knob on a gain', async () => {
  const s = host();
  const run = matriboxAgent(s.h).runner();
  const before = await run('get_controls', {});
  assert.match(before.text, /^Footswitch A: CTRL 1 \(toggles 1 DYN\)$/m);
  assert.match(before.text, /^Quick knob 3: patch volume$/m);
  const r = await run('set_controls', {
    changes: [
      { kind: 'expression', entry: 4, block: 'DRV', parameter: 'Tone', min: 10, max: 90 },
      { kind: 'footswitch', footswitch: 'B', block: 'RVB' },
      { kind: 'quick_knob', knob: 1, target: 'DRV', parameter: 'gain' },
      { kind: 'footswitch_function', footswitch: 'D', function: 'tap tempo' },
    ],
  });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /^Expression entry 4: 2 DRV Tone, 10\.\.90 %$/m);
  assert.match(r.text, /^Footswitch B: CTRL 2 \(toggles .*5 RVB.*\)$/m);
  assert.match(r.text, /^Quick knob 1: 2 DRV Gain$/m);
  assert.match(r.text, /^Footswitch D: tap tempo$/m);
  const a = mbAssignments(s.preset());
  assert.deepEqual(a.expression[3], { entry: 3, slot: 0, paramId: 1, min: 10, max: 90 });
  assert.equal(a.footswitches[3]?.press, 8);
});

test('set_controls checks every change before sending anything', async () => {
  const s = host();
  const run = matriboxAgent(s.h).runner();
  for (const [changes, message] of [
    [
      [
        { kind: 'quick_knob', knob: 1, target: 'BPM' },
        { kind: 'expression', entry: 1, block: 'DRV', parameter: 'Tone', min: 80, max: 20 },
      ],
      /min \(80\) must not be above max/,
    ],
    [[{ kind: 'ctrl', ctrl: 5, block: 'DRV' }], /ctrl must be 1\.\.4/],
    [[{ kind: 'footswitch', footswitch: 'E', block: 'DRV' }], /footswitch must be A, B, C or D/],
    [[{ kind: 'footswitch_function', footswitch: 'A', function: 'boost' }], /no footswitch function "boost"/],
    [[{ kind: 'quick_knob', knob: 2, target: 'DLY' }], /No block "DLY"/],
    [[{ kind: 'quick_knob', knob: 2, target: 'DRV' }], /name the parameter/],
  ] as const) {
    const r = await run('set_controls', { changes });
    assert.equal(r.ok, false);
    assert.match(r.text, message);
  }
  assert.equal(s.sent.length, 0);
});

test('upload_clone checks slot, name and source before the person is asked, and passes the slot 0-based', async () => {
  const s = host();
  const agent = matriboxAgent(s.h);
  const run = agent.runner();
  assert.equal(agent.acts.has('upload_clone'), true);
  const url = 'https://example.com/amp.nam';
  const bad: [unknown, RegExp][] = [
    [{ slot: 0, name: 'x', url }, /slot must be an integer 1\.\.10/],
    [{ slot: 11, name: 'x', url }, /slot must be/],
    [{ slot: 1.5, name: 'x', url }, /slot must be/],
    [{ slot: 3, name: '', url }, /clone name/],
    [{ slot: 3, name: 'Ação', url }, /clone name/],
    [{ slot: 3, name: 'x'.repeat(17), url }, /clone name/],
    [{ slot: 3, name: 'x' }, /exactly one source/],
    [{ slot: 3, name: 'x', url, toneId: 7 }, /exactly one source/],
    [{ slot: 3, name: 'x', url: 'http://example.com/a.nam' }, /https/],
    [{ slot: 3, name: 'x', url, modelId: 1 }, /https link/],
    [{ slot: 3, name: 'x', toneId: 0 }, /toneId/],
    [{ slot: 3, name: 'x', toneId: 7, modelId: 'a' }, /modelId/],
  ];
  for (const [args, message] of bad) {
    const r = await run('upload_clone', args);
    assert.equal(r.ok, false);
    assert.match(r.text, message);
  }
  assert.equal(s.clones.length, 0);

  assert.deepEqual(await run('upload_clone', { slot: 3, name: 'Rect Crunch', url }), { ok: true, text: 'The person wrote "Rect Crunch" to CLONE 3.' });
  assert.deepEqual(s.clones, [{ slot: 2, name: 'Rect Crunch', source: { url } }]);
  s.answer('cancelled');
  assert.deepEqual(await run('upload_clone', { slot: 10, name: 'Tone', toneId: 7, modelId: 9 }), {
    ok: true,
    text: 'The person closed the Clones dialog; CLONE 10 is unchanged.',
  });
  assert.deepEqual(s.clones[1], { slot: 9, name: 'Tone', source: { toneId: 7, modelId: 9 } });
  assert.match(agent.instructions(false), /upload_clone/);
});

test('list_clones shows the names, an empty slot as empty', async () => {
  const run = matriboxAgent(host().h).runner();
  const r = await run('list_clones', {});
  assert.equal(r.ok, true);
  assert.match(r.text, /^CLONE 1: \(empty\)\nCLONE 2: Plexi\nCLONE 3: \(empty\)\n/);
  assert.equal(r.text.split('\n').length, 10);
});

test('search_tone3000 lists tones with their creator and credit, and tells the person to sign in when they are not', async () => {
  const s = host();
  const agent = matriboxAgent(s.h);
  const run = agent.runner();
  const r = await run('search_tone3000', { query: ' Rectifier ' });
  assert.equal(r.ok, true);
  assert.deepEqual(s.searches, ['Rectifier']);
  assert.match(r.text, /^- id 7: "Rectifier Crunch" by ana · gear amp · 2 models · https:\/\/www\.tone3000\.com\/tones\/7\n/);
  assert.match(r.text, /TONE3000.*creator/);
  assert.equal((await run('search_tone3000', { query: '  ' })).ok, false);
  s.signOut();
  const out = await run('search_tone3000', { query: 'x' });
  assert.equal(out.ok, false);
  assert.match(out.text, /sign in to TONE3000 in the Clones panel/);
  // Without TONE3000 set up the tool is not offered.
  const bare = matriboxAgent({ ...s.h, tone3000: undefined });
  assert.equal(
    bare.tools.some((t) => t.name === 'search_tone3000'),
    false,
  );
  assert.equal(
    agent.tools.some((t) => t.name === 'search_tone3000'),
    true,
  );
});

test('clone names and TONE3000 models are picked by simple rules', () => {
  assert.equal(cloneNameFromFile('Mesa Rectifier Crunch (v2).nam'), 'Mesa Rectifier C');
  assert.equal(cloneNameFromFile('Amp ção.nam'), 'Amp o');
  assert.equal(firstEmptyClone(['A', 'Clone 2', 'B', 'Clone 4']), 1);
  assert.equal(firstEmptyClone(Array.from({ length: 10 }, (_, i) => `n${i}`)), 0);
  const models = [
    { id: 1, name: 'Std', size: 'standard', url: 'u1', architecture: '1' },
    { id: 2, name: 'Lite', size: 'lite', url: 'u2', architecture: '1' },
  ];
  assert.equal(pickToneModel(models, 2).url, 'u2');
  assert.throws(() => pickToneModel(models), /several models.*1: Std \(standard\); 2: Lite/);
  assert.throws(() => pickToneModel(models, 5), /no model 5/);
  assert.throws(() => pickToneModel([]), /no models/);
  assert.equal(pickToneModel([models[0]!]).id, 1);
});

test('set_drums starts a rock beat at 100 BPM for practice, on the unit, and says what plays', async () => {
  const s = host();
  const agent = matriboxAgent(s.h);
  assert.ok(agent.tools.some((t) => t.name === 'set_drums'));
  assert.match(agent.instructions(false), /set_drums/);
  const run = agent.runner();
  const r = await run('set_drums', { play: true, rhythm: 'rock', bpm: 100 });
  assert.deepEqual([r.ok, r.text], [true, 'Drum machine: playing · Rock: Rock 1 · 100 BPM · volume 50']);
  assert.deepEqual(s.fake.drum, { playing: true, genre: 0, pattern: 0, bpm: 100, follow: false, volume: 50 });

  assert.match((await run('set_drums', { rhythm: 'Bossanova 1', volume: 30 })).text, /playing · Jazz: Bossanova 1 · 100 BPM · volume 30/);
  assert.match((await run('set_drums', {})).text, /^Drum machine: playing/); // a read
  assert.match((await run('set_drums', { play: false })).text, /^Drum machine: stopped/);

  const bad = await run('set_drums', { rhythm: 'dubstep' });
  assert.equal(bad.ok, false);
  assert.match(bad.text, /no drum rhythm is called "dubstep"/);
  assert.equal((await run('set_drums', { bpm: 20 })).ok, false);
});

test("the first message lists the person's own captures by CLONE model, and the instructions prefer a matching one", () => {
  const s = host();
  const agent = matriboxAgent(s.h);
  const context = agent.context(false);
  assert.match(context, /Your captures \(CLONE slots\):\n- Clone 2: "Plexi"/);
  assert.doesNotMatch(context, /Clone 3: "/, 'empty slots are not listed');
  assert.match(agent.instructions(false), /captures/i);
  assert.match(agent.instructions(false), /already boosted/i);
});

test("playing into an amp's FX return: the first message says no CAB or IR; headphones or PA say nothing", () => {
  const s = host();
  const intoReturn = matriboxAgent({ ...s.h, rig: () => 'amp-return' });
  assert.match(intoReturn.context(false), /How the person plays: into a real amp's FX return[^\n]*no CAB or IR/);
  assert.doesNotMatch(matriboxAgent(s.h).context(false), /How the person plays/);
  assert.doesNotMatch(matriboxAgent({ ...s.h, rig: () => 'full' }).context(false), /How the person plays/);
});
