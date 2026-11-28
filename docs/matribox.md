# Sonicake Matribox II Pro (in progress)

The goal: an MCP server where you describe a tone and the AI builds it on the Matribox II Pro,
like the Pocket Master server does today. What exists so far: the protocol groundwork in
`packages/core/src/matribox/` (framing, pages, LZO1X, messages, name tables, the preset decoder),
the built-in model catalog, and the MCP server (below): the read tools, and **experimental** write tools
decoded from captures but not yet validated on the unit, and the editor UI (below).

Everything below was learned from our own captures of the owner's unit (USB MIDI, 2026-11-24):
the official editor's traffic, and replays of its **read** requests only.

## Connection

- USB composite device: USB audio plus a class-compliant MIDI port named `Matribox II PRO`
  (in and out). No driver; Web MIDI, Electron and Node can all open it.
- It is the Valeton GP-200 platform. The official editor first sends a probe the unit does not
  answer: `F0 21 25 7E 47 50 2D 32 11 12 00 00 00 F7` (`~GP-2`).

## Frames

```
F0 21 25 4D 50 00 00 <ck> <type> <len lo> <len hi> <off lo> <off hi> <data nibbles…> F7
```

| Byte  | Meaning |
|-------|---------|
| 0-6   | Header `F0 21 25 4D 50 00 00` (`MP`) |
| 7     | Checksum |
| 8     | Type: `11` read request, `12` write (host); `00` reply or notification (unit) |
| 9-10  | Total decoded length of the message, two 7-bit bytes (lo, hi) |
| 11-12 | Offset of this page in the message, two 7-bit bytes (lo, hi) |
| 13…   | Data: each byte sent as two nibbles, high nibble first |

- **Checksum (host frames):** `sum(frame[13 : len-1]) & 0x7F`, the data nibbles only, up to (not
  including) `F7`. It matches all 38 single-page host frames captured (11 reads, 27 writes; their
  bytes 10-12 are 0, so the first reading, from byte 10, matched them too) and the three pages of
  the official editor's whole-preset write (capture mb-20) and the 69 pages of the IR and capture
  uploads (mb-17, mb-19), whose length and offset bytes are not summed. The unit's replies use
  another rule, not decoded yet: we keep their checksum and do not check it.
- **Host pages:** the whole-preset write and the IR and capture uploads are the host messages
  longer than one frame: pages of **183** decoded bytes (380-byte frames), each with the total
  length and its own offset, like the unit's 185-byte reply pages. `buildMbFrames` (core) pages a
  host message that way (it rebuilds the 23 pages of the IR upload byte for byte).
- **Pages:** a long reply comes as 384-byte frames, 185 decoded bytes each, every page carrying
  the same total length and its own offset (0, 185, 370, …). Verified on every reply captured:
  e.g. the reply to the `1D 11 10` read is 17 pages, total 2972 bytes (`1C 17` = 28 + 23 × 128),
  and contains the device name and the preset names.
- Byte 9 was first read as a sub-command (`11 10`, `12 1C`, …); it is the low byte of the length:
  the read requests carry 16 or 8 bytes, the parameter drag writes 28.
- **Parameter values** are float32 little-endian, as in the Pocket Master's dumps (knob turns
  decoded as 91, 100 and 64).

What the official editor does on connect: the probe, then reads `11 10` (device info and preset
names, current preset) and `11 08` (user IR names, capture names, other tables). A knob drag
streams `12 1C` writes, a block on/off is `12 18`, selecting a preset is `12 21` followed by a
re-read. Saving was seen once (cmd `05`, see Writes); renaming was not captured yet.

## Messages

The joined page data of every message, both ways, is a message:

```
[flag u8] [0] [0] [cmd u8] [length u32 LE] [LZO1X stream, length bytes]
```

`length` is always the payload length − 8 (checked on all 22 messages of the capture). There is no
uncompressed form: even the 20-byte replies carry a 12-byte LZO1X stream that decodes to 8 bytes,
and the host's read requests store their 4-byte argument as a literal-only stream
(`15 <4 bytes> 11 00 00`). A request without an argument has length 0 and no stream.
`unwrapMbMessage` (core) checks the header and length and decompresses; `mbRequest(flag, cmd, arg)`
builds a read request frame.

### LZO1X

`lzo1xDecompress` in `packages/core/src/matribox/lzo1x.ts` is our own implementation, written from
the public description of the format (the Linux kernel's `Documentation/staging/lzo.rst`). The
data comes from a USB device or a downloaded file, so every read, write and back-reference is
checked, the output is capped (1 MiB by default), and malformed, truncated or trailing input
throws. It was checked byte for byte against liblzo2's `lzo1x_decompress_safe` outside the
repository: every real reply, 1500 random inputs compressed by `lzo1x_1_compress`, 1500 mutated
streams and 3000 random byte strings (same output, and the same accept or reject). The test
vectors in the repository are compressed from invented plaintext.

### The reads the official editor sends on connect

After the `~GP-2` probe, in this order (`arg` = the decompressed request data):

| flag | cmd | arg | Reply (decompressed) |
|------|-----|-----|----------------------|
| 1 | 10 | `00 00 0A 01` | Preset list, 7444 bytes (below). `mbReadPresetNames()` |
| 1 | 10 | `01 00 0A 01` | 8 bytes: the argument, then u32 LE current preset number (66). `mbReadCurrentPresetNumber()`, `parseMbCurrentPresetNumber` |
| 0 | 10 | `43 00 00 00` | A preset, 1211 bytes ("Drive AD"; see below). `mbReadPreset(0x43)` |
| 1 | 11 | `00 08 00 00` | 8 bytes: the argument, then `00 00 00 00` |
| 0 | 14 | none | User IR names, 500 bytes. `mbReadIrNames()` |
| 0 | 18 | none | Capture (clone) names, 252 bytes. `mbReadCloneNames()` |
| 0 | 11 | none | The global settings, 52 bytes (below). `mbReadGlobals()`, `parseMbGlobals` |
| 0 | 13 | none | 10 bytes `00 00 07 00 00 00 3C 00 00 5D`, not decoded |
| 0 | 16 | none | The global EQ, 31 float32 (below). `mbReadGlobalEq()`, `parseMbGlobalEq` |
| 1 | 16 | `01 00 00 16` | 8 bytes `00 00 00 00` + u32: the global EQ switch (below). `mbReadGlobalEqOn()` |
| 0 | 10 | `42 00 00 00` | A preset again, 1211 bytes, "Drive AD". `mbReadPreset(0x42)` |

The preset read's argument is a u32 that the reply's first 4 bytes repeat. `42` (66) is the current
preset; the first read asks for `43` and also gets "Drive AD" (preset 67 is "Cry&Cry"), and the two
replies differ in one byte (offset 37: `00` / `80`), so `43` may mean the edit buffer. Not confirmed:
open question. The MCP server reads the current preset number first and then `mbReadPreset(number)`,
the editor's last read; after a preset select the official editor also re-reads that way. Whether this
returns the stored slot or the edit buffer with unsaved changes is to be checked on the unit (change a
knob, then read).

### Name tables

Names are 17-byte fields, NUL-terminated (16 characters at most); the bytes after the NUL are left
over from older names and are ignored.

- **Preset list** (`parseMbPresetNames`): 4 bytes (the request's argument), 240 u32 LE (values
  2..241 on the owner's unit, meaning unknown), 240 names (17 bytes), 240 style tags (10 bytes:
  "Rock", "Metal", "Acoustic", "" when unset; the owner's rig presets say "@lex"). 4 + 240 × 31 =
  7444. The index is the preset number: the current-preset read returns 66, and name 66 is
  "Drive AD". Name 0 is "Matribox II PRO" (the default name of an empty preset) and "Love of God"
  is 1.
- **User IRs** (`parseMbIrNames`): 20 × 8 bytes (all zero so far), then 20 names: 500 bytes.
- **Captures** (`parseMbCloneNames`): 10 × 8 bytes (zero), then 10 names ("1 FENDER", …,
  "Clone 10"), padded to 252 bytes.

### Presets

A preset read from the unit is 1211 bytes decompressed: its u32 number, then 9 sections. A Matribox
`.prst` file is base64 of a JSON byte array that is itself a raw LZO1X stream (no message header)
holding the same 9 sections, 1207 bytes. Checked on 22 presets (the owner's unit and `.prst` files);
nothing in a preset is a checksum.

Each section is `u32 tag` (`0x10000000` on the unit, `0x10000002` in a `.prst`), `u32 length`, then
a body that starts `00 00 <id> 01`. Ids and body sizes are fixed: 0 (11), 1 (105), 2 (10), 3 (15),
4 (76), 5 (742), 7 (95), 8 (69), 9 (12).

| Section | Offset in body | Meaning |
|---------|----------------|---------|
| 1 | 8 | Name, NUL-terminated (stale bytes after it) |
| 1 | 95 | Style tag ("Rock", "@lex") |
| 4 | 4 | Chain: up to 12 storage slots in signal order, `FF` = none |
| 4 | 16 | Module index per slot (catalog module `index`: DYN 0 … VOL 15), `FF` = unused |
| 4 | 28 | u32 fxid per slot (catalog model `fxid`). IR `0x0A1000nn` = user IR nn, CLONE `0x0F00000n` = capture n |
| 5 | 4 + slot × 60 | 15 float32 per slot, indexed by the catalog parameter `id`, in real units |
| 5 | 724 + slot | On/off per slot |

A slot is a storage slot, not a chain position (live edits address the slot). Values at positions
the slot's model does not use are left over from earlier models: only the model's widget IDs are read.
Sections 0 and 9 are constant; 2, 3, 7 and 8 hold the quick-knob, footswitch-function, expression
pedal and CTRL assignments: see [Unknown sections](#unknown-sections).

`parseMbPreset` (core) takes either size and returns a frozen preset: number (null for a `.prst`),
name, style, chain (slot, module index, fxid, on, the 15 values) and every section raw, for
`writeMatriboxPrst`. `parseMatriboxPrst(text)` reads a `.prst`. `resolveMbPreset(preset, catalog)` names the
modules, models (with the gear they are based on) and parameters with their ranges; an fxid the
catalog does not know is kept and shown as unknown. `mbPresetLabel(i)` gives the label the unit
shows: four presets per bank, `1A`..`60D` (the official editor selected 60D with index 239).

## Unknown sections

What we could decode of the rest, offline, from 27 presets (22 `.prst` files and 5 reads from the
owner's unit: "Drive AD" twice, "Cry&Cry", "TESTE OSX" twice) and the unit's side of the captures: captures 1 to 4 (see Writes) and the **hardware capture** (unit side only, the owner pressing the footswitches and turning the knobs on the unit; kept outside the repository).
Offsets are in the section **body** (its `00 00 id 01` head included), as in the table above.
Confidence: **high** = matches every sample and a capture shows it working; **medium** = fits every
sample, one capture or a clear pattern; **low** = a guess that fits. [docs/matribox-captures.md](matribox-captures.md)
lists the captures that would settle each open point.

### Section 2 (10 bytes): the three knob assignments

| Offset | Type | Meaning | Evidence | Confidence |
|--------|------|---------|----------|------------|
| 4, 5 | u8 × 2 | Slot that knob 1 and knob 2 edit, `FF` = none | Hardware capture: on "Cry&Cry" (`04 01`), turning the knobs on the unit sent set-param messages for slot 4 and slot 1 | High |
| 6 | u8 | Knob 3's target: `0D` in all 27 presets (not a slot; 0..11 are) | Constant. In the hardware capture, knob 3 sent `03 00 05 01` + u32 (below), not a slot's set-param | Medium |
| 7, 8 | u8 × 2 | Parameter (catalog widget ID) of knob 1 and knob 2 | "Cry&Cry" `00 01`: DYN Threshold, WAH Q, the IDs the knob turns carried. "Drive AD": DRV Gain, AMP Gain. Rig presets: Volume of both drives | High |
| 9 | u8 | Knob 3's parameter: `00` everywhere | Constant | Low |

So the table is three `(slot, param)` pairs stored as `[slot1 slot2 slot3][param1 param2 param3]`.
Slot numbers must be remapped when slots are renumbered. waveod's firmware (zxmarcos/waveod,
`fw/preset_format.h`, MIT) settles the rest: a target is a slot 0..11, `0C` the preset tempo (BPM),
`0D` the patch volume, `FF` none (so knob 3's `0D` is the volume, as the hardware capture showed).

### Section 3 (15 bytes): footswitch functions (stomp mode)

From waveod (`fw/preset_format.h`, `editor/preset_msgs.c` `fs_list`), and it fits all our samples
(`01 02 03 04` / `00 00 00 00` / `07 00 05` in "Drive AD"):

| Offset | Type | Meaning |
|--------|------|---------|
| 4..7 | u8 × 4 | Function of footswitch A..D on a press |
| 8..11 | u8 × 4 | Function on a hold (long press) |
| 12..14 | u8 × 3 | Functions of the pairs A+B, B+C, C+D |

Functions (waveod `enum fs_function`, listed in the official editor's order by `model/assign.c`):
0 none, 1..4 CTRL 1..4, 8 tap tempo, 5 looper, 6 drum machine, 19 / 18 previous / next rhythm,
7 tuner, 20 EXP A/B, 12 / 11 preset down / up, 10 / 9 bank down / up, 13..16 preset A..D, 23
footswitch mode. 24..35 toggle slot 1..12 directly: the firmware knows them, the editor does not
offer them, so we only read them. Factory presets: A..D = CTRL 1..4, pairs tuner, looper, mode.
The preset-mode table (FS A..D = preset A..D) lives only in the stored record, not in this section.

### Section 7 (95 bytes): expression pedal assignments

| Offset | Type | Meaning | Evidence | Confidence |
|--------|------|---------|----------|------------|
| 4 | u8 | Which EXP 1 mode is active: 0 = A (volume), 1 = B (wah) | 1 in "Cry&Cry", the only sample with its wah on; 0 in the 26 others (wah off or no wah) | Medium |
| 5..13 | u8 × 9 | Target slot of entries 0..8, `FF` = none | Entry 0 is the VOL slot ("Drive AD", "Cry&Cry", 5 rig presets), entry 3 the WAH slot (every preset with a wah) | High (slots), medium (grouping) |
| 14..22 | u8 × 9 | Target parameter (widget ID) of each entry | "Cry&Cry" entry 3 = WAH Position (ID 3); the `.prst` files use ID 0 | Medium |
| 23..58 | f32 × 9 | Minimum of each entry: 0 in every sample | Constant | Medium (layout), low (units: % or real?) |
| 59..94 | f32 × 9 | Maximum of each entry: 100.0 in every sample | Constant | Medium (layout), low (units) |

Reading of the 9 entries (low): three targets per controller, entries 0..2 = EXP 1 mode A (heel-toe
volume), 3..5 = EXP 1 mode B (wah, switched by the toe switch), 6..8 = EXP 2 (an external pedal on
the EXP/CTRL jack). Only entries 0 and 3 were ever used in our samples.

### Section 8 (69 bytes): CTRL groups

| Offset | Type | Meaning | Evidence | Confidence |
|--------|------|---------|----------|------------|
| 4..8 | 5 bytes | Junk: differs between two reads of the same unchanged preset; zero in one `.prst` that the editor imports | Two "Drive AD" reads, two "TESTE OSX" reads | High (that it is junk) |
| 9 + row × 12 + slot | u8 | 1 = `slot` is in CTRL `row + 1` (rows 0..3 = CTRL 1..4, row 4 = the preset CTRL) | Hardware capture: pressing the footswitches on "Cry&Cry" flipped slots 0, 4, 3, 5 in turn (bulk on/off notices, below), the slots its rows 0..4 name. The rig presets map the same musical layout onto different slots | High (row = switch, column = slot) |

The rows are CTRL groups (waveod: `u8 member[12]` for CTRL 1-4 and the preset CTRL), not
footswitches: a footswitch whose function (section 3) is CTRL n toggles every slot of row n - 1.
With the factory functions FS A runs CTRL 1, which is why the official editor's "footswitch A"
write (capture mb-09, `01 00 08 01` + u32 0 + slot + 1/0) lands in row 0. The tools offer CTRL 1..4;
the preset CTRL (preset mode, pressing the active preset's switch again) is not offered.

### Rest of sections 1, 5 and 9; sections 0 and 3

| Section, offset | Type | Meaning | Evidence | Confidence |
|-----------------|------|---------|----------|------------|
| 1, 4..7 | 4 bytes | Junk (two reads of the same preset differ) | Device reads | High |
| 1, 24..94 | f32 noise | Junk: tiny floats (pairs of equal values), zero or -0.0 in files | Two reads of "TESTE OSX": noise, then all zero | High |
| 5, 736 | u16 | Patch volume, 0..100: 45..90 per preset (45, 50, 60, 63, 70, 90 seen) | Capture mb-01: the preset read before the drag holds 50 and the editor's `03 00 05 01` volume write started at 52 (no read after it) | Medium-high |
| 5, 738 | u16 | Tempo (BPM): 120 in all 27 presets | Constant | Low |
| 5, 740 | u16 | 0 in all 27 presets (tempo source or tap mode?) | Constant | Low |
| 0, 4..10 | 7 bytes | `04 03 0C 01 05 01 0F`, constant (format version?) | 27 presets | Low |
| 3, 4..14 | 11 bytes | `01 02 03 04 00 00 00 00 07 00 05`, constant (switch functions?) | 27 presets | Low |
| 9, 4..11 | f32 + 4 bytes | `00 00 80 3F` (1.0) then `C8 00 00 30` (200 …), constant | 27 presets | Low |

### The unit's own messages (unsolicited)

All are flag 1, cmd `10` or `11`, and the official editor never sends them. From the hardware capture and
captures 1 to 4.

| Data | Meaning | Evidence | Confidence |
|------|---------|----------|------------|
| `01 00 05 01` + u32 slot + u32 param + f32 | A knob turned on the unit: same shape as the host's set param | Hardware capture: knob 1 and 2 turns hit the slot and parameter section 2 names | High |
| `03 00 05 01` + u32 value | Knob 3 turned: values 42, 82, 83, 52, 53 (0..100). The patch volume: the official editor's volume slider sends this same message (capture mb-01) | Hardware capture, mb-01 | High |
| `07 00 05 01` + 12 × u8 | Every slot's on/off (section 5 at 724) after a footswitch press | Hardware capture: one bit changes per press, matching section 8 | High |
| `02 00 05 01` + u32 slot + u32 0/1 | One block toggled on the unit: same shape as the host's on/off | Capture mb-17c (both sides): slot 1 off, then on 1.7 s later, no host frame around them, after a "preset edited" notice. Why this one and not the bulk `07` message (stomp mode, a CTRL switch, the touch screen?) is not known | High (layout), low (trigger) |
| `08 00 05 01` + 18 bytes | Sent while the expression pedal moves and on its toe switch (mb-43: 24 times, heel to toe and back, toe switch twice), but every one holds the same bytes (`FF` × 6, then zeros); the hardware capture's once held f32 100.0. Carries no position we can read: dropped | mb-43, hardware capture | High (trigger), none (content) |
| `01 00 0A 01` + u32 index | Preset changed on the unit | Hardware capture | High |
| `04 00 04 01` + 156 bytes | The assignment tables after a chain edit: section 2 bytes 4..9 or 4..8, section 7 from 5 or 4, section 8 rows (from 9): 6 + 90 + 60 or 5 + 91 + 60 bytes. Sent before the chain notice on add, remove and change model, not on a move | Captures 2, 3, 4: always the empty tables of an empty preset, so the one-byte ambiguity stays | High (content), medium (which byte is left out) |
| cmd `11`, `00 08 00 00` + u32 | "Preset edited" flag: 1 after an edit, 0 after a save | 1 after edits (hardware capture, capture 2); 0 sent 60 ms after the save in capture 1 (so a save does get this one notice); the editor reads it on connect (flag-1 `11` read) | Medium |
| cmd `11`, `00 <id> 00 00` + i32 | A global setting changed on the unit: the host's global write (below), e.g. `00 52` Current Mode toggled 1, 0, 1 in capture 2 | Capture 2 (unit side only); shape of mb-30 … mb-36 | High (`00 52`), medium (other ids: not seen from the unit) |
| cmd `11`, `00 26 00 00` + u32 BPM | The Global Tempo turned on the unit (103 … 120 … 100): the `26` global setting | mb-37 (17 notices, unit side only) | High |
| cmd `13`, 10 bytes | The drum machine's state (the reply to the connect read): u8 playing, 0, u16 genre, u16 pattern, u16 BPM, u8 follows the tempo, u8 volume. `parseMbNotice` decodes it (`kind: 'drum'`); the editor does not show it | Every connect read: `00 00 07 00 00 00 3C 00 00 5D` = stopped, genre 7, pattern 0, 60 BPM, not following, volume 93; layout from zxmarcos/waveod | High (layout), medium (values: never changed in a capture) |
| `00 00 04 01` + chain (89 bytes) | A chain change made on the unit: the model knob of a block screen (one notice per model passed, each after the 160-byte `04 00 04 01` assignments) and a model change before a save | mb-42, mb-44 | High |
| cmd `05`, u32 index + 17-byte name | The loaded preset saved on the unit (after the "preset edited" flag goes to 0): the host's save shape | mb-44 (saved to 60D) | High |

**Following the unit.** `parseMbNotice` (core, `notice.ts`) decodes the rows above marked high
(preset change, `02` and `07` on/off, knob 1/2 set param, knob 3 volume, the "preset edited" flag,
a global setting, the global tempo, the chain notice, the save); tested on the captured frames
(`packages/core/test/fixtures/matribox-notices.txt`). The link hands every message no request took
to `onNotice` (between requests too). The preset-change notice has the bytes of the select echo and
of the current-preset reply, so the link's own answers are taken first; the same goes for the
chain notice answering our chain edits and the echo of our global writes. The web editor
(`useMatribox`) re-reads the loaded preset when the unit loads another one (once: the unit sends it
twice) or changes its chain (once per burst), applies the block, knob and volume notices to what it
shows without a read (the link reads the preset tempo, `04 00 05 01`, every 50 ms while knob or
volume notices come: the unit holds a repeated notice, same cmd and first word, back for up to 150 ms
or 10 steps, stock FUN_0003568C per waveod, and lets it out before any other notice; the tempo read
is a pure read answered through that queue, waveod sub 0x01050004, and no notice has its shape, so
it lets out knob 3's volume notice too, which a patch-volume read could not, and its answer is dropped), updates the Global options from a global or tempo notice, and takes a save
made on the unit into the preset list and the header. Unknown kinds (the expression pedal's `08`
message, the 160-byte assignments, unknown global ids) are dropped. Captures mb-40 (preset by
footswitch) and mb-41 (stomp mode, footswitch A: the bulk `07` message, after a "preset edited"
notice) hold only kinds already followed; in mb-42 the block screen's on/off knob sent the single
`02` message.

### Other connect reads (flag 0, no argument): the global settings

The official editor's reads `02 11 08`, `04 11 08` and `07 11 08` (checksum, type, length) are the
argument-less flag-0 reads of cmd `11`, `13` and `16`: the general settings, an unknown 10-byte
table and the global EQ, then the flag-1 cmd `16` read of the EQ switch. Decoded from the owner's
captures of the official editor's global settings window (mb-30 … mb-39, 2026-11-25; one setting
changed per capture, then the editor reopened to read the tables back). The owner did not put
each setting back, so every read-back holds the changes before it, and mb-29 (baseline) was empty:
mb-32 (a read-back with nothing changed in the editor) and the first sessions' tables served as the
"before". Core: `packages/core/src/matribox/globals.ts`, byte-exact with the captured host frames
(`packages/core/test/fixtures/matribox-globals.txt`); the simulated unit answers and follows them.

Protocol facts cross-checked against zxmarcos/waveod and zxmarcos/matribox-studio (MIT): a
reimplemented Matribox II Pro firmware and an editor whose global ids come from the official app.
In their notation our header `[flag, 0, 0, cmd]` is one u32 (flag 1, cmd `11` = `0x11000001`) and
our `<index> <id> 00 00` is their u32 sub (`01 61` = `0x6101`).

**Global writes.** One setting is flag 1, cmd `11`, `<index> <id> 00 00` + i32 (`mbSetGlobal`): `<id>`
is the setting, `<index>` its channel (MIDI channels: 0 In TRS, 1 In USB, 2 Out TRS, 3 Out USB; 0
for the rest). The unit echoes it with the value it kept, and sends the same message by itself when
the setting changes on the unit. The official editor streams it while a slider moves (mb-30,
mb-31), as it does the patch volume; the unit leaves out an answer equal to the previous one within
150 ms (mb-30: 30 writes, 6 echoes), so the editor sends the newest value only after the echo of the
one before, and a missing echo ends in the link's timeout.

**Never sent** (waveod): flag 1, cmd `11`, `<n> 90 00 00` deletes clone capture n; flag `0E`, cmd `05`
restarts the unit in its bootloader. The core has no builder for either.

**cmd `11`, 52 bytes** (the general settings, `parseMbGlobals`). All bytes not listed are 0.

| Byte | Setting | id | Values | Evidence | Confidence |
|------|---------|----|--------|----------|------------|
| 14 | Input Level | `21` | dB as int8, -20..+20 (manual); written as i32 | mb-30: writes 0 → 5, the byte read back 5 (12 in the first sessions) | High (+), medium (negatives: two-complement, not captured) |
| 15 | Input Mode | `22` | 0 A.GT, 1 E.GT, 2 Line | mb-36: E.GT 1 → Line 2; 0 from the manual's order | High (1, 2), medium (0) |
| 47 | AUX Level | `24` | 0..100 | mb-31 (retaken): writes 81 → 0 → 50 → 80. Bytes 11 and 47 both went to 80 while AUX Level and Brightness were changed (mb-31, mb-32); 47 was the 0 the owner's AUX Level started from, 11 the manual's Brightness 50 | High (write), medium (byte) |
| 35 | Current Mode (footswitch mode) | `52` | 0 Stomp, 1 Preset | mb-33: the byte was 0 (mb-30, mb-32), the owner switched Stomp → Preset and the editor wrote 1; waveod's firmware (`0 = stomp`) and matribox-studio agree. Was 0 Preset / 1 Stomp until 2026-11-26: mb-09 and mb-41 hold no table read, so that reading had no capture behind it | Medium-high |
| 36..37 | MIDI Input Ch (TRS) | `61`, index 0 | i16: 0 Omni, 1..16 | mb-34: the owner's field was labelled "Input Ch (USB)", but the editor wrote `00 61` (index 0) and byte 36 went 0 → 5; waveod and matribox-studio (the official app's names) make index 0 the TRS input | High (write, byte), medium (TRS: the label disagrees) |
| 38..39 | MIDI Input Ch (USB) | `61`, index 1 | i16: 0 Omni, 1..16 | 0 in every capture; `01 61` from waveod, not captured | Medium |
| 40..43 | MIDI Output Ch (TRS, USB) | `61`, index 2, 3 | i16: -1 off, 0 Omni, 1..16 (waveod clamps above 16) | 0 in every capture; offered (`midiOutTrs`, `midiOutUsb`) | Medium |
| 44 | MIDI In Source | `62` | 0 TRS Only, 1 USB Only, 2 Mixed | mb-35: Mixed 2 → USB Only 1 (then put back); 0 from the manual's order | High (1, 2), medium (0) |
| 48..49 | Global Tempo BPM | `26` | u16 40..300 (`FF FF` while never set) | Between mb-36 and mb-38 the tempo was set to 100: `FF FF` → `64 00`. mb-37: the unit's `00 26 00 00` + BPM notices; the write and its echo from waveod | High (read), medium (write: not captured) |
| 50 | Global Tempo on | `25` | 0/1; the unit reads and answers 0 while the BPM is not set | `00` → `01` with the BPM above; mb-45: the unit sent `00 25 00 00 00` by itself. Write from waveod | High (read), medium (write) |
| 11 | Brightness | `14` (read only) | percent | Changed on the unit in mb-32 (the official editor does not offer it), 50 → 80; waveod: the screen's backlight, a read with no write | High |
| 5 | Auto CAB | `05` | 0/1 | `01` in every capture; waveod (record +0x11) | Medium |
| 18 | USB Rec Level | `31` | dB int8 -20..+20 | 0; waveod (+0x1E) | Medium |
| 19 | USB Monitor Level | `32` | dB int8 -20..+20 | 0; waveod (+0x1F) | Medium |
| 20 | AUX To USB | `33` | 0/1 | `01`; waveod (+0x20) | Medium |
| 21, 22 | USB Rec Mode L / R | `34`, index 0, 1 | 0 dry, 1 processed | `01 01`; waveod (+0x21) | Medium |
| 24 | EXP 2 jack | `41`, index 1 | 0 EXP, 1 single FS, 2 dual FS | 0; waveod (+0x24) | Medium |
| 25, 27 | External footswitch 1 / 2 | `42`, index 0, 2 | footswitch function ids (`MB_FS_FUNCTIONS`) | 0; waveod (+0x25, +0x27) | Medium |
| 33 (and 34) | Bank Sel Mode | `51`, index 0 (index 1 writes the same byte) | 0/1: 0 Wait, 1 Initial assumed from the manual's order | 0; waveod (+0x2D) | Medium (byte), low (labels) |
| 45 | Clock Source | `63` | 0 Internal, 1 TRS Only, 2 USB Only, 3 External, 4 Mixed | `04`; waveod (+0x79) | Medium |
| 46 | Clock Out | `64` | bit 0 TRS, bit 1 USB | 0; waveod (+0x7A) | Medium |
| 2, 9 | Unknown (2: run mode, waveod) | | `02`, `01` | Never changed | Unknown |

Every row marked waveod is written like the captured ones and echoed with the value the firmware
kept (`mbSetGlobal`); none is captured yet. Not offered: USB mode (`06`, the firmware sets it without
any answer, and a wrong choice drops the computer connection), language, display and standby.

**Global Tempo.** `00 25` switches it (0/1) and `00 26` sets its BPM (40..300); the unit echoes
both (waveod; no host write captured: mb-37 was taken on the unit). In the official editor,
switching Global Tempo on switched itself off again at once; on the unit, enabling it asks for a
confirmation on the unit's screen before it works (owner, 2026-11-25), and the unit answers `00 25`
with 0 while it has no BPM. So the editor sends the BPM as set, and when the switch's echo does not
come it says to accept it on the unit's screen (the settings are read again).

**MIDI In Source and the editor.** The editor's tuner, tap tempo and BPM controls are MIDI Control
Changes over USB: with "TRS Only" the unit would ignore them (the SysEx editing itself is not a
MIDI message the setting governs, but that is not checked). So the builder refuses 0 and Global
options offers USB Only and Mixed only. The editor's Control Change channel follows MIDI Input Ch
(USB) (byte 38) when it is not Omni, so changing it does not cut the tuner and tempo off.

**cmd `13`, 10 bytes**: the drum machine's state (above, "The unit's own messages"):
`00 00 07 00 00 00 3C 00 00 5D` in every capture.

### Drum machine (waveod, not captured)

`packages/core/src/matribox/drum.ts`. The state read is flag 0, cmd `13`, no argument: u8 playing,
0, u16 genre 0..7, u16 pattern within the genre, u16 BPM, u8 follows the tempo, u8 volume 0..100.
A setting is flag 1, cmd `11`, `00 <8n> 00 00` + u32 like a global setting: `81` play/stop (not
stored), `82` genre << 16 | pattern, `83` pattern in the current genre, `84` BPM 40..300, `85`
follow the effects' (preset or global) tempo, `86` volume 0..100. waveod's firmware answers with
`{sub, value}` notices (`82`/`83` both with `82` and the pattern word; `85` on with `84` + the
BPM it took, then `85`), but sends **nothing** for play when it already plays, for a BPM while it
follows the tempo with the clock from TRS, USB or external MIDI, and for a volume over 100. So
`mbWriteDrum` reads the state, posts the writes (rhythm, tempo, volume, then play), reads the state
back and says which value the unit kept. The answers are `drumChange` notices: the editor follows
them, and the state reply (`drum`) too. Genres and the 100 pattern names (`MB_DRUM_GENRES`,
`MB_DRUM_PATTERNS`) are waveod's table from the V1.2.2 application: Rock 30, Blues 10, Funk 7,
Jazz 7, Pop 8, Electronic 7, World 21, Metronome 10.

In the editor, the *Drum machine* panel plays or stops it and sets style, rhythm, tempo (off while
it follows the preset tempo), the following and the volume. The tone assistant's `set_drums` and
the MCP server's `matribox_set_drums` take a style or a rhythm name, a BPM, the following and the
volume ("play a rock beat at 100 BPM"). The older `matribox_drum` (the manual's Control Changes,
unanswered) stays for the drum menu.

**cmd `16`, 124 bytes: the global EQ** (`parseMbGlobalEq`), 31 float32 LE. One value is written as
flag 2, cmd `16`, u32 **word index** + f32 (`mbSetGlobalEqGain`, `mbSetGlobalEqLevel`); the unit
echoes it.

| Words | Values (first sessions) | Reading | Evidence | Confidence |
|-------|-------------------------|---------|----------|------------|
| 0..2 | 1, 80, 0.71 | Low cut: switch, frequency 19..20000 Hz (19 = off), Q | waveod's EQ order | High |
| 3..6 | 0, 20, 0.71, 0 | Low shelf: switch, frequency, Q, gain | waveod | High |
| 7..10 | 1, 250, 1, -1 | Band 1: switch, frequency 20..20000 Hz, Q 0.1..10, gain -20..+20 dB | waveod | High |
| 11..14 | 1, 500, 0.71, 0 | Band 2; word 14 = gain | mb-38: write word 14 = 3.0, read back +3 dB | High |
| 15..18, 19..22 | 1, 1000, 0.71, 0; 1, 5000, 1, 1 | Bands 3 and 4 | Same layout, waveod | High |
| 23..26 | 0, 20000, 0.71, 0 | High shelf: switch, frequency, Q, gain | waveod | High |
| 27..29 | 1, 8000, 0.71 | High cut: switch, frequency 20..20001 Hz (20001 = off), Q | waveod | High |
| 30 | 50 | Level, 0..100 | mb-39: writes word 30 = 50 … 70, read back 70 | High |

The gains of bands 1..4 are words 10, 14, 18, 22; Global options writes all four (band 2's write
was captured, the others follow the same rule and waveod's handler, which clamps the value to the
word's range and echoes what it kept).

**Frequency and Q writes (not captured).** `mbSetGlobalEqFrequency` writes a band's frequency (words 8, 12,
16, 20; 20..20000 Hz), the Lo Cut's (word 1; 20..1000 Hz, 19 = off) or the Hi Cut's (word 28; 1000..20000 Hz,
20001 = off), and `mbSetGlobalEqQ` a band's Q (words 9, 13, 17, 21; 0.1..10). Unlike the gain and level
writes, **none of these was captured from the official editor**: they follow the word layout above through
the same `eqWrite` and must be checked on the owner's unit before a release.

**The EQ switch**: flag 1, cmd `16`, `01 00 00 16` + u32 0/1 (`mbSetGlobalEqOn`), read with the same
argument. The unit answers both with `00 00 00 00` + u32, not an echo (mb-39: off, then on), so the
link's `ask` takes the answer by its shape and `mbWriteGlobalEqOn` checks it holds the new state. A
write to the state the switch is already in gets **no answer** (waveod), so `mbWriteGlobalEqOn`
reads the switch first and sends nothing then.

**In the editor**: *Global options* (header, beside the preset file buttons; on a phone under ⋯) is
read on connect (`mbReadGlobalState`, a failure leaves the editor usable and the dialog says it
could not read) and offers Input Mode, Input Level, AUX Level, Current Mode, Global Tempo (switch
and BPM), Bank Sel Mode, Auto CAB, MIDI Input Ch (USB and TRS), MIDI In Source (USB Only, Mixed),
the global EQ switch, its level and the gains of bands 1..4; folded groups hold MIDI Output Ch, Clock
Source and Clock Out, USB audio (rec and monitor levels, AUX to USB, rec L/R dry or processed), and
the EXP 2 jack with the external footswitches' functions; brightness and the cut filters are shown only. Each change is one write, the newest value only while a slider moves; a write the unit
does not confirm shows the error and the globals are read again. Not checked on the owner's unit yet.

## MCP tools

The MCP server in `apps/mcp` talks to whichever supported pedal is plugged in. The pedals are told
apart by their MIDI port name (`Pocket Master`, `Matribox II PRO`; `apps/mcp/src/devices.ts`). The
Pocket Master keeps its tools; the Matribox's start with `matribox_`, and nothing they send writes:

- `which_pedal`: which supported pedals are connected (it lists MIDI ports, nothing is sent).
- `matribox_list_presets`: the 240 presets by label, with style tags, the loaded one marked.
- `matribox_get_preset`: the loaded preset: chain in order, each block's model and the gear it is
  based on, on/off, parameters by name with their ranges; IR and CLONE blocks show the slot's name.
- `matribox_list_models`: the catalog by module (all 16, or one), with origins and parameter ranges:
  the palette the assistant plans a tone from. Built in (below): nothing to install.
- `matribox_list_irs`, `matribox_list_captures`: the user IR and capture slot names.
- `matribox_load_ir` (write, experimental): a WAV into a user IR slot; see "User IR and capture
  uploads".

Each call opens the ports, sends only the official editor's read requests (`11` frames), collects
and joins the reply pages, and closes. A reply is matched by its flag, cmd and the argument it
repeats, so notifications the unit sends on its own (footswitches, knobs) are skipped; no answer in
3 seconds is an error. Tests run against a simulated unit that answers with our captured replies.

The write tools (experimental: every answer says so until the owner validates them on the unit):

- `matribox_set_param`: one parameter of a block, by the name `matribox_get_preset` shows, refused
  outside the catalog's range. A block is named by its chain position or its module.
- `matribox_set_module_on`: a block on or off.
- `matribox_select_preset`: loads a preset by label (unsaved changes are lost).
- `matribox_set_model`: swaps the model in a block (assignment tables, the chain with the slot's new
  module and fxid, then every parameter at the model's default).
- `matribox_build_tone`: the whole chain in one call, `[{module, model, on?, params?}]` in signal
  order, block i in slot i, every parameter written (the model's default when not given). All of it
  is checked against the catalog before anything is sent. It clears the assignment tables.
- `matribox_save_preset`: stores the loaded preset in a slot under a name. `confirm` must repeat the
  slot label; the slot is read first and kept in `~/.pocket-master-editor/backups`
  (`<time>-matribox-<label>.json`: label, index, name and the 1211 bytes as hex).

Each write waits for the unit's echo of it (same flag, cmd and data; 3 s; a set param or on/off
takes the echo of its slot and parameter whatever value it carries, since the unit echoes the
value it kept). When a write of `matribox_build_tone` fails, the old chain is put back (removed,
added again, its values written) and the error says nothing was applied. Tests run against a
simulated unit that applies the writes to an in-memory preset and echoes them.

The web editor sends a whole chain (Undo, Redo, the assistant) planned from what the unit holds,
read just before, not from the screen; a value or switch the unit already has is not written
(fresh blocks come on, with their model's defaults). When a write fails it puts the unit back the
same way and reads it again. Before 2026-11-26 a failed write left the screen stale: the unit had
applied the adds, the next build planned from the empty chain on screen and added the whole chain
again, until the unit refused a third CAB for memory (`00 07` notice, 2) and its CPU guard switched
every block off (FUN_00022514), the "(off)" blocks of the owner's 12-block result.

Live controls (experimental, **checked on the owner's unit, 2026-11-24**: volume, footswitch
rows A–D and assignment, expression assignment and range, tuner, BPM, tap tempo, looper and drum
CCs; CTRL 1–4 and the quick-knob CCs were not tried; see "Live controls" and
"MIDI Control Change"):

- `matribox_get_assignments`: the loaded preset's patch volume, tempo, footswitch A–D functions
  (and the blocks they toggle), CTRL 1–4, quick knobs and expression entries (reads only).
- `matribox_set_volume` (0..100), `matribox_assign_footswitch` (A..D, a block, assign or not:
  through the CTRL the switch runs, setting a switch on another function to its own CTRL first),
  `matribox_assign_ctrl` (CTRL 1..4, a block), `matribox_set_footswitch_function` (A..D, a
  function by name, press or hold), `matribox_assign_quick_knob` (1..3, a block's parameter,
  "BPM", "volume" or "none"),
  `matribox_assign_expression` (entry 1..9, a block's parameter by name, min and max 0..100) and
  `matribox_set_expression_range`: SysEx writes, echoed; the assignments are read back.
- `matribox_tuner`, `matribox_tap_tempo`, `matribox_set_bpm` (40..300), `matribox_looper`,
  `matribox_drum`, `matribox_ctrl` (1..4), `matribox_quick_knob` (1..3): Control Changes on
  `channel` (default 1). Nothing comes back, so the answer says to check on the unit.

Whole presets (experimental, **checked on the owner's unit, 2026-11-24**: export, import into
57D, backup all (240 in 1 min 30 s) and a restore of three slots; see "Whole-preset write"):

- `matribox_export_preset`: the loaded preset (unsaved edits included) or a slot, written as a
  `.prst` in `~/.pocket-master-editor/presets/matribox`. Sends only reads; never replaces a file.
- `matribox_import_preset`: a `.prst` from that folder loaded whole into the loaded preset. With
  `preset` and `confirm` (the same label) it is also saved there, after the usual backup.
- `matribox_restore_backup`: a backup `matribox_save_preset` wrote, loaded whole and saved back to
  its own slot (`confirm` repeats its label; that slot is backed up again first).
- `matribox_backup_all_presets`: all 240 presets, each read with its slot loaded, in one file in
  `~/.pocket-master-editor/backups` (default `<time>-matribox-all.json`; see "Backup all").
- `matribox_restore_all_presets`: writes every preset of such a file back into its slot
  (`confirm: "ALL"`); by default all 240 are backed up to a new file first (`backup: false` skips it).

File names are resolved inside their folder: `..`, absolute paths and other extensions are refused.

## Reading a slot: the unit reads only the loaded one

Owner's unit, 2026-11-24: a preset read by index (flag 0, cmd `10`, u32 index: `mbReadPreset`)
returns the **loaded preset's edit buffer**, tagged with the requested index, whenever that index
is not the loaded one. Seen twice: an export of 58D while 3B was loaded gave 3B's "Chorus Clean",
and the backup taken before saving to 59D while 60D was loaded held 60D's "TESTE OSX". The
official editor never reads an unloaded slot: it selects it (`01 00 0A 01` + u32 index) and then
reads. The simulated unit (`packages/core/test/fake-matribox.ts`, shared by the core, MCP and web tests)
now behaves the same way.

So every read of a slot that may not be loaded selects it first (core `mbReadSlot`), which
discards the loaded preset's unsaved edits. What changed (MCP server and editor alike):

- **Save to another slot** (`matribox_save_preset`, the editor's Save dialog): the loaded preset
  (edit buffer, edits included) is read first; the target is selected and read (now what it
  stores) and that is the backup; the edit buffer is written into the target with the
  whole-preset write (`mbWritePreset`, which stores the slot it names) and read back (sections 2,
  3, 4, 5, 7, 9); a save (cmd `05`) follows only when the name changes. **The target stays loaded**
  (before, the slot that was loaded stayed loaded). If anything fails after the select, the edit
  buffer is kept too (MCP: a backup file of the slot that was loaded, `source: "edit-buffer"`;
  editor: in the backups list), so the edits are not lost.
- **Save over the loaded slot**: unchanged (backup, cmd `05`, read back). Reading what that slot
  stores would need a select, which would drop the very edits being saved, so its backup is the
  edit buffer as it was before the save, marked `source: "edit-buffer"` in the backup record
  (`"slot"` for one read with its slot loaded). To keep a restorable copy of what the loaded slot
  stores, back up before editing (export, or *Back up all*).
- **Export of a slot** (`matribox_export_preset` with `preset`): when it is not the loaded one it
  is selected, read, and the original preset selected again; unsaved edits of the loaded preset
  are lost. Exporting the loaded preset still reads the edit buffer (edits included).
- **Import and restore of one backup** (`matribox_import_preset`, `matribox_restore_backup`): the
  slot is selected before it is read for the backup (before, the backup was read first, so it held
  the edit buffer).

## Backup all

One file with all 240 presets (format: [docs/preset-file-format.md](preset-file-format.md#matribox-ii-pro-backup-all-file)).
*Back up*: remember the loaded index, then for each index select it and read it (1211 bytes), then
select the original index again (also after an error). *Restore*: the file is checked whole
first; then for each preset select its index, write it whole (`mbWritePreset`) and read it back
(sections 2, 3, 4, 5, 7, 9 must match); the first failure stops it with the slots already written;
then the original index is selected again. Both lose the loaded preset's unsaved edits (the
editor asks first when there are any). Before a restore, all 240 presets are backed up (MCP: a new
file in the backups folder; editor: downloaded), unless that is turned off. The preset names
come with the whole-preset write (section 1); the unit's preset list shows them without a save
(checked on the owner's unit: a restored slot took its name back).

## Whole-preset write

Capture mb-20 (the owner's unit, 2026-11-24): the official editor importing a `.prst` into 57D
(index `0xE3`). It selected 57D, read it, then sent the whole preset in **one message**:

- Host → unit: type `12`, **flag 2**, cmd `10`, data = **1211 bytes**: u32 index (`E3 00 00 00`) +
  the 1207-byte body, the shape a preset read returns, in three pages of 183 bytes (above). The
  body carries the `.prst` section tag `0x10000002` in all 9 sections (a read shows `0x10000000`):
  the "`02` where reads have `00`" bytes at data offsets 4 and 23 are the first two tags. The editor
  compressed it for real; our literal-only stream is valid LZO1X too, in 7 pages.
- Unit → host: flag 0, cmd **`17`**, data `02 00 00 10`. The answer to wait for.
- The editor then read the current preset number and the preset: the new one, with the unit's own
  section tag. Sections 0, 2, 3, 4, 5, 7 and 9 came back byte for byte; section 1 differed only in
  its junk bytes (4..7 and the float noise from 28) and section 8 only in its junk (4..8).

`mbWritePreset(index, preset)` (core) builds it from any parsed preset (unit, backup, `.prst`):
`mbPresetBody` gives the body with the `.prst` tags, `buildMbFrames` the pages. Checked out of the
repository against capture mb-20: the data we build from the captured preset is the captured data
byte for byte, and the captured pages pass our checksum. The capture's data is not in the
repository (the preset may come from a commercial pack); the tests rebuild the shape from the
owner's "Drive AD" and keep only the capture's frame heads.

This one write carries everything: chain, parameters, on/off, the knob (sec2), expression-pedal
(sec7) and footswitch (sec8) assignments, the patch volume and tempo (sec5 at 736 and 738) and the
style tag.

**The write stores the slot it names** (owner's capture "midi para 1,2,3", 2026-11-24, official
app): a `.prst` imported into 58D was still there after loading 59D and coming back, with no save;
importing into 59B, the app then sent a save (cmd `05`) only to give the slot its name. So the MCP
server treats it as destructive, like a save: `matribox_import_preset` and
`matribox_restore_backup` need the slot and `confirm` with its label, back that slot up, load it
(select), write it, read it back (sections 2, 3, 4, 5, 7 and 9 must match), and send a save only
when the name given differs from the preset's. Our write is the official app's data uncompressed
(7 pages instead of 3); the unit takes it (checked on the owner's unit: an import into 57D was
stored and read back).

`writeMatriboxPrst` (core) is the inverse of `parseMatriboxPrst`: `mbPresetBody`, a literal-only
LZO1X stream, a JSON byte array, base64. Whether the official editor opens a `.prst` written this
way is still to be checked.

## User IR and capture uploads

Captured from the official editor (captures 17, 17b, 17c and 19, with the uploaded files at hand). Both are
flag-1 messages in paged write frames; the unit acknowledges with flag 3, the same cmd and
`u32 slot, u32 1, u32 0`, and the editor then reads the name table again. An empty slot is the one
whose name is still the default (`User IR 7`, `Clone 6`, …); the table's 8 bytes per slot are zero
for every slot, used or not.

**User IR, cmd 0x14, 4128 bytes:**

| Offset | Size | Meaning |
|--------|------|---------|
| 0      | 4    | Slot, 0-based (5 = the 6th) |
| 4      | 4    | 0 |
| 8      | 4    | Checksum (below) |
| 12     | 20   | Name, the file name cut to 16 characters, NUL padded |
| 32     | 4096 | 1024 samples, int32 LE in the int24 range, 44.1 kHz |

The samples are the WAV converted the way the official tool's native helper (`getNormalWav`) does
it, now reproduced sample for sample (`mbIrSamplesFromWav()`, checked against the capture by
`matribox-ir-capture.test.ts`, which runs only where the capture is):

1. JUCE reads the WAV's **first channel** as floats (an int24 sample becomes `s / 2^23`).
2. r8brain-free-src **1.6** `CDSPResampler24` resamples it to 44.1 kHz: 2x upsampling through a
   Kaiser-windowed linear-phase low-pass (transition band 2 %, 180.15 dB), then the 24-tap,
   673-position fractional-delay interpolator (`packages/core/src/matribox/r8b.ts`). The version
   and parameters come from the binary's symbol names and constants: `CDSPFracDelayFilterBank<24,
   673, 3, 8>`, `getInLenBeforeOutStart` and the 34/45 % intermediate bands exist only in 1.2-1.6,
   the `(filter, up, down, latency, bool)` convolver only from 1.6.
3. JUCE writes a 24-bit WAV (`Temporary.wav`): `round(f * (2^31 - 1)) >> 8`, ties to even.
4. The first 1024 samples are sent; there is no normalisation, fade or window.

No other rate was captured: 44.1 kHz files pass through unchanged (r8brain skips equal rates) and
every other rate is refused for now.

**Checksum (offset 8):** the byte sum (each byte 0..255) of the u32 slot, the u32 zero, the
20-byte name field and the first **1366** converted samples as int32 LE, of which only 1024 are
sent; a WAV shorter than that is padded with silence. It fits the three captured uploads exactly:
the real 48 kHz IR (mb-17, `0x000A7CD2`; 1366 is the only count that gives it), and two WAVs made
for it (48 kHz, 24-bit mono): all zeros (mb-17b, slot index 6, `0x05AE`) and one sample
`0x100000` then zeros (mb-17c, slot index 7, `0x028EB6`). Why 1366: ceil(1024 × 4 / 3) is a guess.
For 44.1 kHz files (no resampling) we take the same 1366 samples of the file; not captured.

The official editor compresses the message for real (LZO1X): the silence fits one page, the
impulse seven. The real IR was incompressible and went out as literals in 23 pages, which is what
we always send: `mbIrUpload(slot, name, wav)` (core) rebuilds that capture frame for frame, and the
data of the other two byte for byte (`matribox-ir-upload.test.ts`, with the two WAVs and their
captured frames as fixtures; the real IR's check runs only where the owner's files are).

**`matribox_load_ir`** (MCP, experimental until checked on the owner's unit): a WAV from
`~/.pocket-master-editor/irs` (44.1 or 48 kHz, `.wav`, resolved inside that folder) into user IR
slot 1..20, `confirm` repeating `IR<slot>`; the name defaults to the file name cut to 16
characters. It reads the IR names first: a slot whose name is not the default `User IR n` holds an
IR the unit cannot send back, so it is only overwritten with `replace: true`. It then sends the
pages, waits for the flag-3 acknowledgement (status 1 = stored, anything else is reported) and
reads the names again to check the slot took the name. The simulated unit acknowledges the same
way and renames the slot.

**Capture (clone), cmd 0x18, 8872 bytes:** u32 slot (9), u32 0, u32 byte sum of the `.clo`,
20-byte name (`5 RECTIFIER`), then an 8840-byte `.clo`: the same `VTSI` container as the Pocket
Master's (`packages/core/src/clo/codec.ts`; header and biquad identical). The official editor
compresses this message for real (LZO1X, 8377 bytes on the wire for 8880); we send it as literals,
49 pages. The unit answers flag 3, cmd 0x18, `u32 slot, u32 status, u32 0` (status 1 = stored).
waveod's firmware rebuild (`src/editor/media_msgs.c`) adds what was not captured: the unit keeps
the first 0x2000 bytes of the `.clo` (IR 2 is played to 1024 taps, so nothing played is lost), and
**rename** is flag 2, cmd 0x18, `u32 slot` + a 20-byte name, not answered (check it by reading the
names). The clone names are read with flag 0, cmd 0x18 (`mbReadCloneNames`).

**`mbUploadClone(link, slot, clo, { name, onProgress })`** (core, `matribox/clone.ts`): checks the
slot (0..9), the name (1..16 printable ASCII) and the `.clo` (size, magic, CRC), sends the 49
pages, waits up to 10 s for the answer (the unit writes flash first), throws unless status is 1,
posts the rename when a name is given and reads the names back to check it. Its frames for our
A/B `.clo` are byte for byte the prepared `opensonicx-5-RECTIFIER-clone9.syx`, whose builder
rebuilds mb-19 byte for byte from the official `.clo`. It has no builder for the clone delete or
the bootloader message. The simulated unit (`packages/core/test/fake-matribox.ts`) answers the
names, takes the upload (checking the sum), acknowledges it and applies the rename.

**User IR rename** (waveod, not captured): flag 2, cmd 0x14, `u32 slot` (0..19) + a 20-byte name,
not answered, the clone rename's shape (`mbRenameIr`). `mbWriteIrName(link, slot, name)` posts it and
reads the IR names back to check it. The editor's *User IRs* panel lists the 20 slots and renames
one in place; the MCP server has `matribox_rename_ir`. The simulated unit applies it.

**Offline CLONE block** (`simulateClo(clo, input)`, core `clo/simulate.ts`): the firmware's chain
as waveod's bit-exact `src/blocks/clone/clone.c` runs it (gain, IIR 1 in double with the x 1000 /
x 0.001 scaling, IR 1, the saturator 4x oversampled through the half-band all-pass interpolators
and decimators, IIR 2, IR 2), with the knobs at 50 (unity gain, flat tone stack). The convolutions
are direct here: the firmware's partitioned 128-point FFT gives the same linear convolution at
unity gain. Against waveod's C block, compiled locally, on a random capture and a noise DI the
difference is 98 dB under the output. `checkClo(clo, cloProbe())` refuses a capture that plays
silent (under -70 dB RMS), far too loud (over -3 dB RMS or peaks over 4) or NaN on 3 s of the
synthetic DI at a quarter level; the official 5 RECTIFIER capture plays it at -13.9 dB RMS, peak
0.67. A test converts the public `ref_input.nam` with `generateMatriboxClo` and plays the result
through the simulator against the model's own output on a noise DI: level within 1 dB, each
third octave from 100 Hz to 10 kHz within 6 dB (+0.2 .. +5.3 dB, the bass high).

**Where it is used.** The Matribox editor's Clones panel (pick a `.nam` or `.clo`, convert in a
web worker with progress and cancel, the simulated check, then the upload after a confirmation),
the tone assistant's `upload_clone` (the desktop app's AI connection offers it as
`matribox_upload_clone`; it opens that panel and only the person's confirmation writes), and the
MCP server's `matribox_upload_clone` (a file in `~/.pocket-master-editor/nams`, an https link or a
TONE3000 tone; confirm `CLONE<slot>`, an occupied slot only with `replace: true`). All
experimental: no upload of ours has been checked on the unit yet.

### The official NAM -> `.clo` conversion (research, 2026-11-24)

**The capture is reproducible.** A small C harness (not committed) that `dlopen`s the installed
editor's `HTUSBTools.dylib`, calls `InitDartApiDL` with stub Dart functions and then
`namConvertCloData(callback, diWav, outWav, namPath, outBuffer, callback)` (no MIDI function is
touched) turns `5 RECTIFIER.nam` into an 8840-byte `.clo` in a few seconds that is **identical, byte
for byte, to the one in mb-19**. The conversion is deterministic and has no hidden input (unit
state, firmware, slot). `namConvertClo` (the file variant) writes the result through an
`std::ofstream` that is never opened and crashes outside the app; the `Data` variant copies it
into the caller's buffer.

**Same reference signal as ours.** The editor bundles `flutter_assets/assets/wavs/nam_input_wav.wav`
(70 s, 44.1 kHz, 16-bit, two identical channels, SHA-256 `9bb6c1b1…29aa1a`). Its first channel
divided by 32768 is SonicMaster's `nam_reference_di_44100.f32` sample for sample. So the DI,
its level and its length are ruled out: the difference is the algorithm.

**A different algorithm, not different parameters.** From the binary's symbols, call graph and the
debugger trace of one conversion:

1. `getConvertNormalWav(di, 48000)`: the DI resampled to the model's rate (48 kHz; JUCE +
   r8brain, as for the IRs) and cached as a 24-bit mono WAV
   (`~/Library/Caches/HTUSBTools/HTCache/48000.wav`).
2. `getNamOutput`: NeuralAmpModelerCore (`nam::get_dsp`, WaveNet/LSTM/ConvNet, Eigen) runs the
   model **once**, at the DI's own level, over the whole 70 s; the output is written as a
   **16-bit** stereo WAV at 48 kHz. There are no probe levels: SonicMaster (and so our port)
   runs the model five times, at 0.1, 0.03, 0.01, 0.003 and 1.0.
3. `HTKPA::init(48000)`, `setInputSignalPath(48000.wav)`, `setOutputSignalPath(nam output)`:
   both read into `70 * fs + 600`-sample float buffers (each must be at least 70 s at exactly
   `fs`).
4. `HTKPA::startClone()`, its own fit: remove the output's mean and linear trend, find the
   response onset, build per-segment envelope tables (max |input|, max/min output) and fit the
   asymmetric exponential saturator to them (a double-precision least-squares start, then a
   long unrolled `expf` search), then alternate 2x oversampled passes (`HT_IIRUpX2` ->
   saturator -> `HT_IIRDownX2`), FFT block convolutions (`convolverInit/ProcessMono`, Ooura and
   CMSIS `arm_rfft_f32`), transfer-function estimates (`tfestimate`), `smoothdata`,
   `HTKPA::iterAmpCoeff` (up to three rounds), `downSampleSmoothFreq`, `minPhaseIR`, and finally
   `convertSampleRate` of both FIRs to 44.1 kHz into the VTSI container. The arithmetic is
   float32 throughout, NEON-vectorised.

**Why nothing was shipped.** Rebuilding that byte for byte in TypeScript means matching, in
float32 and in the compiler's summation order: NAM's Eigen inference (whose output is then
rounded to 16 bits, so a one-ulp difference flips samples), Apple libm's `expf`, two FFT
libraries and r8brain, through an iterative fit that amplifies any difference. That is far past
a sensible effort, and a "close" result could not be verified: nothing short of the unit's sound
tells whether a near miss is good enough. Scaling our probe level does not converge either: the
official fit never sees more than one level, so its gains (0.0858 vs 0.165) come from another
estimator, not a 5.7 dB offset.

**Ways forward (owner's call):**

- *Use the installed official converter.* On a Mac with the editor installed, the harness above
  makes the exact `.clo` the editor would send; `matribox_load_capture` could then upload it
  (the builder is the 32-byte header + the `.clo`, all known). This depends on Sonicake's binary
  at run time (macOS only, breaks if they change the entry point), so it was not done without
  the owner's say.
- *Upload our own `.clo`.* Same container, different fit: whether the unit plays it well (or at
  all) is untested. One upload of our converter's `.clo` of `5 RECTIFIER` into a free CLONE slot,
  compared by ear with the official one, would settle whether exactness matters.
- *Port `startClone` approximately* (the stages above, decompiled further) and judge it by ear,
  not bytes.

**Port of `startClone` (waveod, 2026-11-26).** waveod (github.com/zxmarcos/waveod, MIT, Marcos
Medeiros) reconstructed the editor's fit from the same library (`tools/clonefit/clonefit.cpp`,
`docs/clone_fit.md`) and reports it within 0.05 % (saturator) and 0.1 dB (IRs) of the editor's
own on an A1 model. `packages/core/src/clo/startclone.ts` and `startclone-dsp.ts` port it, with
our WaveNet (`wavenet.ts`, run in blocks and prewarmed on a receptive field of silence like
NeuralAmpModelerCore) and our r8brain port for the IRs (`r8b.ts`):

1. The DI at the `.nam`'s `sample_rate` (24-bit), the model run once at level 1, its output
   x 0.31 at 16 bits.
2. IIR 1 identity, IIR 2 the 40 Hz Butterworth high-pass at that rate (float32 math; at 48 kHz it
   is the `CLO_BIQUAD` every captured `.clo` carries).
3. The output's mean and trend removed (float32 sums), the onset after the 6 s click, the
   saturator `A (1 - e^(-k x))` per polarity from the 0-5 s sine's 0.1 s peaks (A the largest, k
   the small-signal slope, then the best of 0.8 .. 1.2 x k).
4. Welch transfer estimates (Hamming 0.125 s, nfft 2048) of the IR-less model against the output
   on the quiet noise and on the loud sweep through a cabinet-like FIR; their ratio starts IR 1.
5. `iterAmpCoeff` on the sweep (3), the quiet noise (2) and the pink noise (5): spectral shape
   moved between IR 1 (128 taps) and IR 2 (2048 taps), both minimum phase, kept at the best mean
   |ln| residual over 512 mel frequencies, 80 Hz - 10 kHz.
6. IR 2 corrected from the averaged spectra over the guitar (50-70 s), its energy matched, x 4.
7. Both IRs to 44.1 kHz (r8brain).

Against the official `5 RECTIFIER` capture (local test `clo-startclone-ab.test.ts`, run with
`MATRIBOX_CLO_AB=1`; the files stay private): gains `0.08581 / 0.08643 / 744.3 / 750.3` vs
`0.08583 / 0.08635 / 747.0 / 753.1`, IIR 2 identical, arrayB within 0.49 dB per 1/3 octave from
40 Hz to 12.5 kHz, arrayA's shape within 0.5 dB from 160 Hz to 4 kHz. **Open:** arrayA is about
4 dB under the official's at 1 kHz, up to +1.2 dB in the bass and up to 6 dB high above 6 kHz
(where it is 20-40 dB down). The divergence is the quiet-noise pass: ours keeps its second
iteration, which moves 4.6 dB from IR 1 into IR 2 (residual 0.024 vs 0.032). Rejecting that pass
(a best residual carried over from the sweep pass) puts arrayA within 0.14 dB in level and 0.1 dB
above 1 kHz, but arrayB then misses by 0.86 dB at 2-5 kHz, so neither is the editor's exact rule.
Simulated on the reference DI, the faithful port plays the guitar and pink-noise sections within
0.7 dB per 1/3 octave and 0.1 dB in level of the official capture, and the -62 dBFS noise 2.2 dB
quieter. The fit takes about 2 s; the model run is most of the ~35 s.

**What would help from the owner:** (1) a yes/no on calling the installed editor's converter;
(2) an A/B by ear on the unit of the official `.clo` vs ours for the same NAM (ours could be
sent by an experimental tool); (3) for an approximate port, a second real capture of the
official upload of a different NAM (another architecture, e.g. a LSTM or a "lite" WaveNet), to
check the port on more than one model.

## Writes

Every write but the whole preset (below) is a flag-1 message in a type `12` frame, its data a literal-only LZO1X stream. The
unit echoes set param, on/off and select back as a type `00` message (it may compress the
echo); it answers a chain edit with its **chain notice** instead (below), and a save with nothing. Host frames from captures
1, 3 and 4 (MIDI Monitor spying on output to the unit); capture 2 recorded only the unit's side.
Builders in `packages/core/src/matribox/write.ts`; tests compare them with the captured frames
(`packages/core/test/fixtures/matribox-chain-edits.txt`, `matribox-writes.txt`).

| Write | cmd | Data | Evidence |
|-------|-----|------|----------|
| Set param | 10 | `01 00 05 01` + u32 slot + u32 parameter **order** + f32 value; echoed with the widget ID | Host frames, byte-exact; owner's unit ✓; order vs ID: capture mb-46, waveod / matribox-studio |
| On/off | 10 | `02 00 05 01` + u32 slot + u32 0/1 | Host frames, byte-exact; owner's unit ✓ |
| Select | 10 | `01 00 0A 01` + u32 index (60D = 239) | Host frames, byte-exact; owner's unit ✓ |
| Add block | 10 | `01 00 04 01` + `FF` + u8 position + u8 module + u32 fxid | Host frame (capture 4); owner's unit ✓ |
| Move block | 10 | `01 00 04 01` + u8 from + u8 to + `FF` + `FF FF FF FF` | Host frame (capture 4); owner's unit ✓ |
| Remove block | 10 | `01 00 04 01` + u8 position + `FF` + `00` + `00 00 00 00` | Host frame (capture 4); owner's unit ✓ |
| Change model | 10 | `02 00 04 01` + u8 slot + u8 module + u32 fxid | Host frames (capture 3); owner's unit ✓ |
| Save | 05 | u32 index + 17-byte name (NUL-padded) | One host frame; owner's unit ✓ |
| Patch volume | 10 | `03 00 05 01` + u32 0..100 | Host frames (mb-01), byte-exact; not yet sent by us |
| Footswitch | 10 | `01 00 08 01` + u32 switch (A = 0) + u32 slot + u32 1/0 | Host frames (mb-09), byte-exact; not yet sent by us |
| Expression assign | 10 | `02 00 07 01` + u32 group + u32 position + u32 slot + u32 param + f32 min + f32 max (range ignored) | Host frame (mb-04), byte-exact; owner's unit ✓ |
| Expression min / max | 10 | `03 00 07 01` / `04 00 07 01` + u32 group + u32 position + f32 | Host frames (mb-04), byte-exact; owner's unit ✓ |
| Global setting | 11 | `<index> <id> 00 00` + i32 (ids above) | Host frames (mb-30, mb-31, mb-33 … mb-36), byte-exact; MIDI In USB and Global Tempo from waveod; not yet checked on the unit |
| Global EQ value | 16, **flag 2** | u32 word + f32 | Host frames (mb-38, mb-39), byte-exact; bands 1, 3, 4 from waveod; not yet checked on the unit |
| Global EQ switch | 16 | `01 00 00 16` + u32; answered `00 00 00 00` + u32 | Host frames (mb-39), byte-exact; not yet checked on the unit |
| Whole preset | 10, **flag 2** | u32 index + 1207-byte body (`.prst` tags), paged | Host pages (capture mb-20); answered by cmd `17`; not yet sent by us |

- Set param names the parameter by its **order** in the model's list (the catalog's parameters
  sorted by widget ID: 0, 1, 2 …), and the unit echoes it with the **widget ID** (its knob position
  in sec5): stock FUN_000213CC / FUN_0002048C, as zxmarcos/waveod and zxmarcos/matribox-studio
  reimplement them. They differ where a model's IDs skip: every CAB and IR (Volume, Low Cut, High
  Cut at IDs 1, 5, 6 = order 0, 1, 2), the Peavey 5150 (Presence ID 6 = order 5), DLY 6 and 13,
  FREQ 2 and 4. An order past the list lands on ID 0 (capture mb-46, 2026-11-26: ID 5 sent as the
  order to a CAB, echoed `… 02 00 00 00 00 00 00 00 …` = slot 2, ID 0). Every captured set param
  before was on a model with IDs 0, 1, 2 …, where both are the same. The expression and quick-knob
  assignments likely take the order too (waveod's sub_exp): not changed yet, unchecked.
- Set param and on/off address the **storage slot**, not the chain position (capture 2: the delay
  was slot 1 while first in the chain). Add, move and remove take **chain positions** (0-based):
  "from" `FF` adds, "to" `FF` removes. The unit picks the storage slot of an added block.
- Change model takes the **storage slot**, like set param and on/off (checked on the owner's unit
  with a block in slot 0 at position 2). The unit loads the new model's defaults by itself.
- **Chain notice**: after a chain edit the unit sends `00 00 04 01` + sec4 from byte 4 (order,
  module per slot, u32 fxid per slot) + 12 on/off bytes + 1 byte (the slot touched, `FF` for a
  move), often after a 160-byte `04 00 04 01 …` message (likely the expression-pedal and footswitch
  tables). Both are the unit's, never sent by the host: an earlier reading of capture 2 took them
  for writes, and the unit ignores them (checked on the owner's unit, 2026-11-24).
- **Save** stores the loaded preset (edits included) in the slot and gives it the name; the loaded
  preset takes the name too. The unit sends **no answer** (no echo; only the "preset edited" flag notice going to 0,
  see [the unit's own messages](#the-units-own-messages-unsolicited)), so we check a save by
  reading the slot back: its name in the preset list, its chain (sec4) and its parameters (sec5). Checked on the
  owner's unit (59D, 2026-11-24). Reading the loaded preset's own number returns the edit buffer, so
  the backup taken before saving over the loaded slot holds the edits, not what was stored.

Every write above but the whole preset and the live controls has been checked on the owner's unit (2026-11-24).

### Live controls (captures mb-01, mb-04, mb-09)

The official editor streams the patch volume while its slider moves (`03 00 05 01` + u32, the
message knob 3 sends from the unit) and the unit echoes some of them; a footswitch box and the
expression pedal's assign, min and max are single writes, each echoed. Builders in
`packages/core/src/matribox/write.ts` (`mbSetPatchVolume`, `mbAssignCtrl`, `mbSetFootswitchFunction`, `mbAssignQuickKnob`,
`mbAssignExpression`, `mbSetExpressionMin`/`Max`), tested against the captured host frames
(`packages/core/test/fixtures/matribox-controls.txt`). `mbAssignments` (core) reads the volume,
tempo, footswitch rows and expression entries back from a preset.

- **CTRL (was "footswitch"):** CTRL 1 = 0 (capture mb-09: the editor's footswitch A box put slot
  0 in, out, then slot 1; FS A runs CTRL 1). A CTRL can hold several slots (one section 8 row).
- **Footswitch function** (waveod, not captured): `01 00 03 01` (press) or `02 00 03 01` (hold) +
  u32 switch 0..3 + u32 function; the unit echoes it. Stomp mode only.
- **Quick knob** (waveod, not captured): `01 00 02 01` + u32 knob 0..2 + u32 target (slot, 12 BPM,
  13 volume, `FFFFFFFF` none), then `02 00 02 01` + u32 knob + u32 parameter; each echoed.
  `mbAssignQuickKnob` sends both. The AI tools and `mbAssignmentsText` read them back.
- **Expression assign:** settled on the owner's unit (2026-11-24; capture mb-04 had every field at
  0): u32 **group** (0 = EXP 1 mode A, 1 = mode B, 2 = EXP 2), u32 **position** in the group
  (0..2), u32 **slot**, u32 **parameter**, f32 min, f32 max. Entry = group × 3 + position, the
  order section 7 lists them in: (1,0,1,0) landed in entry 4 on slot 1, (0,0,1,1) in entry 1 on
  slot 1 parameter 1, and the pedal then swept that parameter. **The unit ignores the range in an
  assignment** (it applies 0..100 and echoes 0..100 back), so the official editor's way is the
  one to follow: assign, then send min / max (`mbExpressionWrites`). Min / max take the same group
  and position (checked: setting entry 4's range left entry 1 alone). Min and max are 0..100,
  stored as f32 in section 7 at 23 and 59. Removing an assignment was not captured.
- Unsaved edits, these included, are discarded when another preset is loaded. The tuner sends no
  SysEx at all (the official editor has no tuner traffic); it is a MIDI Control Change (below).

## MIDI Control Change

Sonicake's manual (firmware V1.2.2, "MIDI Control Information List") lists Control Changes the unit
acts on. They go over the same USB MIDI port as the SysEx, as plain 3-byte messages
`Bn cc value` on the unit's MIDI channel (global settings: Omni or 1..16), and only when its
"MIDI In Source" includes USB. The unit sends no answer. Switches read 0..63 as off (stop, post) and
64..127 as on (play, pre); we send 0 and 127. `MB_CC`, `mbControlChange` and `mbBpmControlChanges`
(core, `cc.ts`) build them; the links send one with `control()`. **None is checked on the unit yet.**

| CC | Values | Function |
|----|--------|----------|
| 0 | 0..1 | Bank MSB: 0 for 1A..30D, 1 for 31A..60D, then Program Change 1..120 |
| 7 | 0..100 | Preset (patch) volume |
| 11 | 0..100 | EXP 1 |
| 13 | switch | EXP 1 mode A / B |
| 16, 18, 20 | 0..100 | Quick-access knob 1, 2, 3 value (MSB) |
| 17, 19, 21 | 0..63 / 64..127 | Quick-access knob 1, 2, 3 one step down / up (LSB) |
| 22, 23 | any | Bank + / bank − |
| 24, 25 | any | Preset + / preset − |
| 26, 27, 28 | any | Bank +, bank −, bank (wait mode) |
| 29 | switch | Footswitch mode: preset / stomp |
| 43..54 | switch | Block 1..12 on/off |
| 58 | switch | Tuner on/off |
| 59 | switch | Looper on/off |
| 60, 61 | any | Looper record, auto record |
| 62 | switch | Looper stop / play |
| 63, 64 | any | Looper undo/redo, delete loop |
| 65, 66 | 0..100 | Looper recording volume, playback volume |
| 67 | switch | Looper placement post / pre |
| 68, 69 | 0..2, 0..127 | Preset BPM: MSB, LSB; BPM = MSB × 128 + LSB, 40..300 |
| 70 | any | Tap tempo |
| 71..74 | 0..127 | CTRL 1..4 |
| 92 | switch | Drum machine (menu) on/off |
| 93 | switch | Drum stop / play |
| 94 | 0..99 | Drum rhythm |
| 95 | 0..100 | Drum volume |

The manual's BPM example gives CC68 = 1 for both 128..255 and 256..300; with CC68's range 0..2,
256..300 is CC68 = 2 (we send `bpm >> 7`, `bpm & 127`). Program Change, bank, preset ±, EXP 1, the
footswitch mode and block on/off CCs are listed but not used: the SysEx writes above already do
those.

## Editor (web and desktop)

The editor opens the plugged-in pedal by itself and picks its editor by the MIDI port name (`pedalOfPort`, core): a `Matribox II PRO` port
opens the Matribox editor, a `Pocket Master` port the Pocket Master's, which comes first when both
are plugged in (an open connection is kept until its pedal is unplugged; see `findPedal` in
`apps/web/lib/midi.ts`). The Matribox editor (`apps/web/components/Matribox*.tsx`, `lib/useMatribox.ts`,
`lib/matribox.ts`) talks through core's `matriboxLink`, the same request rules as the MCP server,
and sends only the official editor's reads and the core write builders, one request at a time.
The page looks like the Pocket Master's. The chain is a wrapping grid of tiles (module drawing and
colour, model, an LED that switches the block, arrows, a last *Add* tile), laid out as a snake:
each row reads left to right and a cable behind the tiles bends from the end of one row to the
start of the next, so no sideways scroll. Dragging a tile is one move-block write plus the usual
read-back (`useTileDrag`, shared with the Pocket Master; touch keeps the arrows). A block's model
menu lists only its module's models grouped by the catalog's model types; *Add* asks for the
module, then the model. On a phone, Export, Import and Read fold under a ⋯ menu. The editor also
follows the unit: `MatriboxLink.onNotice` hands over what the unit sends by itself (see "The unit's own messages"), so a preset switch (one re-read), block on/off, knob 1/2 and the
patch volume show without a read. Status on the owner's unit: following the unit's own changes,
the tone library's Keep/Load and the snake with a long preset are **not yet checked** there.
The tone library (`components/MatriboxLibrary.tsx`): *Keep tone* reads the edit buffer and keeps
it in this browser (key `pocket-master-editor.matriboxLibrary.v1`) with a name and notes; *Load*
sends a kept chain to the loaded preset as one Undo step through the validated writes and never
writes a slot; the library exports to and imports from `matribox-library.json`.
The tone assistant uses the same library.
A parameter drag sends only the newest value once the previous write is confirmed. After a chain
edit or a preset select it reads the loaded preset again. Save reads the slot, keeps it as a
backup in the browser (localStorage, newest 20, same JSON as the MCP server's backups), and stores
the loaded preset as described in "Reading a slot" (another slot: whole-preset write, the slot
stays loaded; the loaded slot: save), then reads the slot back. *Back up all presets* and
*Restore all…* (section "All presets") download and read one backup-all file, with progress
("Backing up 12A", "Restoring 12A"); see "Backup all". One preset as a file
(`components/MatriboxPresetFile.tsx`, `lib/matriboxPresetFile.ts`): *Export preset* reads the edit
buffer (unsaved edits included; nothing is selected) and downloads `<label> <name>.prst`
(`writeMatriboxPrst`); *Import preset…* reads a `.prst` or a backup of one slot, shows its name
and chain, and after an explicit confirmation does what the official app does (see "Whole-preset
write"): select the target (the loaded slot by default), keep what it stores in the backups list,
write the preset whole, read it back (sections 2, 3, 4, 5, 7, 9). The target stays loaded, under
the name the file carries (no cmd `05`); unsaved edits of the loaded preset are lost, which the
dialog says. A Pocket Master `.prst` (515 bytes, starts with "Pocket Master") and anything else
that is not a Matribox preset are refused before anything is sent. It also shows the patch volume (a slider, newest value only, like a knob), the **Footswitches
and CTRL** panel (what footswitches A–D run in stomp mode, and a grid of the blocks in CTRL 1–4),
**Quick knobs** (each knob's block and parameter, BPM or volume, Apply), the nine expression entries (block, parameter, min, max, Apply) and a
tuner / tap tempo / BPM row sent as Control Changes on a chosen MIDI channel; after an assignment
it reads the loaded preset again. Undo and Redo cover the chain edits only (the history replays
chains). The model catalog is built in (below): nothing is picked or loaded. The e2e tests
(`apps/web/e2e/matribox.spec.ts`) run the editor against the simulated unit with it.

## DSP load (an estimate)

A preset of 12 blocks made the owner's unit show "CAUTION! System overloaded" (2026-11-26). The
unit sends no load meter over USB; what is known comes from zxmarcos/matribox-studio
(`docs/firmware/audio-engine.md`, `docs/effects/testing.md`) and zxmarcos/waveod
(`src/engine/overload.h`, `docs/bench.md`, `docs/stock_port.md`, `docs/clone_fit.md`), both MIT,
© 2026 Marcos Medeiros:

| Fact | Value | Confidence |
|------|-------|------------|
| Audio block | 64 frames at 44.1 kHz = 1.451 ms = 870 748 cycles of the 600 MHz Cortex-M7 | High |
| CPU overload rule (stock app) | three blocks in a row over 1.25 ms: every slot switched off (bypassed, not removed), the preset marked edited, the warning shown | High (reimplemented in waveod) |
| Chain budget | the app's own work ≈ 165 µs, so the chain gets ≈ 1 ms ≈ 600 000 cycles | Medium |
| Measured costs (stock) | Cab/IR ≈ 190 µs (≈ 114 k cycles), factory Clone ≈ 125 k, the 63 amps 3.78 M in all (≈ 60 k each) | Medium (single measurements) |
| Memory rule | inserting or replacing a block checks the module pools first: Cab/IR ≈ 70 KB and Clone ≈ 74 KB of the 192 KB fast RAM, so a third CAB/IR/CLONE is refused with the warning | Medium-high |
| Overload notice | flag 1, cmd `11`, `00 07 00 00` + u32: 1 the DSP ran out, 2 a block refused for memory (matribox-studio's editor reads it; waveod's firmware sends it with 2). A flag-1 read of the same sub returns and clears it | Medium (not captured on the owner's unit) |

`mbDspLoad` (core, `matribox/dsp-load.ts`) is therefore an **estimate**: one cost per module (no
per-model numbers exist), the measured ones above for AMP, CAB, IR and CLONE and our guesses,
set high on purpose, for the rest (DYN 25 k, FREQ 80 k, WAH 25 k, DRV 45 k, EQ 20 k, MOD 45 k,
DLY 50 k, RVB 100 k, routing and VOL 5 k), summed over every block (bypassed ones too: a
footswitch can switch them on) against 600 k cycles. The guesses were set so that a typical
12-block chain (DYN, FREQ, two DRV, AMP, CAB, EQ, two MOD, DLY, RVB, VOL) comes out at 106%, as the
owner's overloaded; "Drive AD" (6 blocks) is 58%. Levels: `high` from 85%, `over` past 100% or
with more than 2 CAB/IR/CLONE blocks.

- **Editor**: under the chain, "Estimated DSP load: N%" with a meter, a note near the limit and a
  warning past it; nothing is blocked (the person decides). When the unit sends the overload
  notice the editor shows it (`parseMbNotice`, `kind: 'overload'`) until closed; after a CPU
  overload the unit's own on/off notices already show every block off.
- **Tone assistant and MCP tools** (`mbCheckDspLoad`): `build_tone` and `edit_preset` (web), and
  `matribox_build_tone`, `matribox_add_block` and `matribox_set_model` (MCP) refuse a chain that is
  past the limit and heavier than the one loaded, before anything is sent, saying the estimate and
  the heaviest modules to drop; near the limit the answer ends with a note. An edit that adds no
  load (a knob, a removal) is never refused. The preset text the assistant reads carries the
  estimate, and the tool descriptions and instructions tell it to keep chains lean.
- **Simulated unit**: refuses a third CAB/IR/CLONE with the overload notice (2); with
  `cpuOverload` it switches every block off past the estimate, with the notice (1).

To make it better: the owner's 12-block preset (which blocks) and the chains that do or do not
overload on the unit would calibrate the guesses; per-model costs need a measurement on the unit
(waveod's bench runs only on its own firmware, not used here).

## Phases

The same gates as the Pocket Master: each phase is validated by the owner on his unit before the
next one starts.

1. **Read only:** connect, read device info, preset names, the current preset. Nothing sent but
   the read requests the official editor sends. Done in the MCP server; waiting for the owner's
   check on the unit.
2. **Live edit:** parameter and block writes (`12` frames). Built and tested against the simulated
   unit; waiting for the owner's check on the unit.
3. **Save:** writing presets to slots, with a backup of every slot it overwrites. Built (cmd `05`,
   unverified); waiting for the owner's check.
4. **MCP tools:** describe a tone, the assistant builds it on the unit (`matribox_build_tone`).

## The model catalog

The models and their parameters (16 modules, 267 models) are built in, in the web app, the PWA,
the desktop app and the MCP server; nothing has to be installed, picked or loaded. Core exports
them as `MB_CATALOG`, built by `mbCatalog(map, text)` from two files of ours:

- `packages/core/src/matribox/models.json`: a clean functional map, only what the protocol needs,
  in our own structure. It is written by `scripts/matribox-map.mjs` from a local copy of the
  official editor's `alg_data.json` (`node scripts/matribox-map.mjs <path>`); that file is never
  committed or shipped, and the script keeps none of its descriptions, parameter help, notes,
  legal notice block or model display names (it refuses to write any key outside the schema).
- `packages/core/src/matribox/model-text.json`: our own short name for each model and our own
  description in English and Portuguese, keyed `"MODULE:fxid"` (e.g. `"DRV:50331648"`). The UI
  shows the description in its language; the MCP server and the assistant read the English one
  (the web assistant the one of the UI). An optional `gear` names the real gear in plain text
  (no trademark signs); when set it is the model's `basedOn` (the menus' right column, "Based
  on"), and the descriptions start with "Inspired by <gear>." / "Inspirado no <gear>.".

Parameter units live in a third file, `packages/core/src/matribox/units.json`, which is edited by hand
(the generator never touches it): a key `"MODULE:Label"` gives the unit to every model of that module
with that control name, and `"MODULE:fxid:Label"` to a single model, overriding the first. Only units
that are certain are listed (the manual, plus a matching range); a parameter with no entry shows the
bare number. `mbFormatValue(value, param)` renders it ("400 ms", "1.2 kHz", or the plain number).

Schema of `models.json` (version 1):

```
{
  "version": 1,
  "modules": [                       // by module index
    {
      "module": "DRV",               // module code
      "index": 3,                    // module index in the protocol (DYN 0 … VOL 15)
      "models": [                    // by model index
        {
          "fxid": 50331648,          // model id the unit reads and writes
          "index": 0,                // position in the module's list
          "type": "OD",              // our category, groups the model menus ("" when none)
          "basedOn": "…",            // the real gear, plain text on one line ("" for originals);
                                     // model-text.json's `gear` when set
          "params": [                // by id
            {
              "id": 0,               // parameter slot (index of the preset's 15 values)
              "label": "Gain",       // generic control name
              "min": 0, "max": 100, "step": 1, "default": 50,
              "options": ["Off", "On"]   // only for a switch or a list, one label per step
            }
          ]
        }
      ]
    }
  ]
}
```

Core tests check that `models.json` holds only the keys of this schema (none of the source's texts or names) and no trademark signs, that every
model has our text (names unique per module, none carrying a brand or model token of real
gear), and the generator on synthetic input. Names of real gear are trademarks of their owners,
used only to describe the sound (see NOTICE). Tests of the editors use small invented catalogs
in the same schema (`packages/core/test/matribox-fake-catalog.ts`).

## Clean room

Community projects about this unit exist online; most have no license, so none of their code is
used here. Reading them for ideas is allowed; the code is our own, written from our captures.
zxmarcos/waveod and zxmarcos/matribox-studio are MIT (© 2026 Marcos Medeiros): their protocol
facts and the DSP figures above are used with attribution (THIRD_PARTY_NOTICES.md).
