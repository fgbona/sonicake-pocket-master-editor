# Changelog

All notable changes to this project are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Workstation UI: the amp faceplate's "Based on" line is set in the condensed label face, bold,
  uppercase and tracked out, instead of a cursive script, which read as dated. One web font fewer.

### Added

- **The workstation UI is the editor's new default interface.**
  See [docs/design/workstation-ui.md](docs/design/workstation-ui.md) for the layouts, the visual system
  and what is still open.
  decisions and what is still open.
  - **Fixed-screen shell from 1280 px up**, like HX Edit or Axe-Edit. The page itself never
    scrolls; only the bank list, the block panel and the open dock tab do.
    - The top bar holds the preset display (slot, name, bank role, sync chip) and the actions.
    - Under it are the bank browser on the left, the signal chain with the rig-view gear drawings,
      and the selected block's panel.
    - A **bottom dock with real tabs** holds Assistant, Clones & IRs, Controls, Library, Backups
      and Global & EQ. It can fold, and an assistant capture upload opens its tab by itself.
  - Below 1280 px the same parts stack, with every dock panel shown. The phone layout is unchanged.
  - **Sync state**:
    - The preset bar shows whether the edit buffer is in sync with the pedal, edited and not
      stored in its slot, or being read or sent.
    - Amber dots mark the loaded preset in the bank list, each edited block, and **each edited
      knob, switch or list**. They compare against the value last read from or saved to the pedal.
    - Both pedals go through one read-only adapter (`lib/workstation/device.ts`,
      `useDevice.ts`); the protocol hooks are unchanged.
  - **Knobs**: click the value (or press Enter on a knob) to type a number; it is clamped and
    snapped, and Escape cancels. Knobs are 88 px in the block panel and 72 px elsewhere.
  - **Banks of three**: banks show CLEAN / RHY / LEAD by position (the Matribox's A/B/C, its D
    marked FREE; the Pocket Master's user presets in threes) as a hint only, never a rename. The
    save dialogs' CLEAN / RHY / LEAD buttons rename a preset within its bank (`MTL-RHY` →
    `MTL-LEAD`).
  - **Visual system:** the editor is drawn as hardware.
    - The stage: a near-black chassis with grain and machined panels instead of web cards. The
      preset shows on an OLED-style display (a glowing number, the name, bank, role and sync LED).
    - The chain: a pedalboard of square, category-coloured blocks, with gear drawings, a lit cable,
      IN/OUT jacks and LED bypass switches.
    - Controls: footswitches A–D as stomp caps with LED rings, under the chain and clickable;
      keys instead of pills, lit buttons with an LED for every on/off switch, and recessed
      selectors.
    - Type: Barlow Condensed labels and Share Tech Mono readouts, both self-hosted through
      next/font. Dark is the default; the light theme is a brushed-alloy chassis.
  - **Domain displays:**
    - The Global EQ is a frequency-response graph, computed from the unit's bands with RBJ
      biquads. Each band has a node you drag, scroll, use the keys on or double-click to reset,
      and hardware controls sit under the graph.
    - Compressor, gate, delay, reverb and EQ blocks draw their behaviour on a small screen in their
      panel, and the expression pedal shows its heel-to-toe range.
    - The global settings' level sliders are now knobs.
  - A model with more than eight parameters shows its knobs in pages of eight. Beside the knobs, the
    block panel shows the block's screen, or its gear drawing and model. The model description is a
    quiet line under them.
  - **Global options are no longer a dialog.** They are the dock's Global & EQ tab, which the
    Global options button (Matribox) or ⚙ (Pocket Master) opens.
  - The Matribox's experimental notice is now an LED in the preset bar, with the full text in a
    tooltip.
  - Matribox knobs show a unit only where the manual states it (pitch in semitones, ring-mod
    Fine in Hz, Detune in cents, Time R in %); the rest are listed in the design doc.

### Changed

- The Pocket Master's preset file buttons (export/import) moved into the Library section.
- Matribox II Pro tone assistant: **it uses your own captures.** The first message lists the filled
  CLONE slots by name ("Clone 10": "OSX RECTIFIER"), and the assistant puts a capture in place of
  the built-in AMP model when its name matches the amp or drive the reference calls for (never a
  capture of other gear just because it is there), with a CAB after it only when the output needs
  one, and no boost before one already boosted ("TS", "808" in the name). The owner found his
  Rectifier capture far fuller and stronger than the built-in amp and cab.
- Matribox II Pro tone assistant: **"The assistant builds for:"** headphones, PA or interface (with
  cabinet), or an amp's FX return (no cabinet), kept per browser. Into a return the first message
  says so and the assistant puts no CAB or IR: the owner plays into his Marshall DSL40CR's return,
  where the built-in Green 4x12 on top of the real speaker made the tone dull, boomy and weak. For
  amps played cranked (Plexi, JCM800, AC30) it gets the drive from the amp gain and the boost, not
  from EQ cuts (its Van Halen tone had the EP booster at 10 and the amp at 48).

### Fixed

- Matribox expression pedal: choosing "Unused" for an entry now enables Apply and clears it
  on the unit. Before, Apply stayed greyed out, so a pedal assigned to a parameter (a drive's
  Gain, say) kept setting it from the pedal position every time the preset loaded.

## [1.2.2] - 2026-11-27

The tone assistant works with Claude models that think on their own (claude-fable-5-2), which
failed after their first tool call, and Claude answers cost much less: the system prompt, tools
and model list are sent with prompt caching, so each tool round trip reads them at a tenth of the
price.

### Fixed

- Tone assistant: **Claude models that think on their own (claude-fable-5-2 and the like) no longer
  fail after their first tool call** with "400 Invalid `signature` in `thinking` block". The
  assistant sends the long first prompt (with the model list) once and then swaps it for a short
  one, but a reply's signed thinking is bound to every message before it, so the swap broke it.
  Once a reply carries thinking, the first prompt now stays as it was sent.
- Tone assistant: **Claude answers cost much less.** The system prompt, the tools and the first prompt
  (with the model list, the bulk of every request) are sent with prompt caching, so each tool round
  trip after the first reads them at a tenth of the price instead of paying them again (the owner's
  "Ain't Talkin' 'bout Love" tone with claude-fable-5-2 cost about US$ 1.60 without it). The cost
  estimate counts cache writes at 1.25x and reads at 0.1x.

## [1.2.1] - 2026-11-26

The Matribox II Pro tone assistant now builds tones that need a CAB, an IR or the 5150 amp, and
a failed write no longer piles blocks up on the unit. A value write to a model whose parameter IDs
skip (every CAB and IR, the 5150, two delays and two FREQ blocks) used the widget ID where the unit
takes the parameter's order, so it timed out or moved the wrong knob, also from the editor's own
knobs in 1.2.0. Each chain is now planned from the unit's current preset and rolled back when a
write fails; the assistant stops after the same tool fails twice, shows an animated busy dial and
renders Markdown; and the patch-volume knob turned on the unit follows at once.

### Added

- Tone assistant: the "working" bubble now has a small amp-knob dial that turns while the assistant
  builds the tone, and shows the seconds elapsed after 3 s ("Working on it... 12 s" / "Montando... 12 s").
  With reduced motion the dial pulses gently instead of turning. The bubble is a `role="status"`
  region and the glyph is `aria-hidden`.

### Fixed

- Tone assistant: replies no longer show raw Markdown. A tiny parser (no HTML injection, no new
  dependency) renders bold, italic, inline code, bullet and numbered lists and line breaks as React
  elements; anything else, including HTML-looking text, stays plain text.
- The privacy note under the assistant only mentions Google's free-plan use of the conversation when
  a Gemini key is in play (or no key is set up yet), not with only an Anthropic or Groq key.
- Matribox II Pro: **a value write to a CAB, an IR, the Peavey 5150 amp or any model whose
  parameter IDs skip now reaches the right knob and is confirmed.** The owner's "Van Halen, Jump"
  tone failed every time (capture mb-46): the CAB's Low Cut (widget ID 5) was sent as is, but the
  unit takes a parameter's *order* in its model's list (Volume, Low Cut, High Cut = 0, 1, 2) and
  echoes the widget ID (stock FUN_000213CC / FUN_0002048C, as zxmarcos/waveod and matribox-studio
  reimplement them). Order 5 is past the CAB's three, so the unit echoed ID 0 and the write timed
  out; a CAB's Volume (ID 1) would even have moved its Low Cut. `mbSetParam` now takes the slot's
  model, sends the order, refuses an ID the model does not have, and the link checks the echo
  against the widget ID (web editor, assistant, Undo/Redo and the MCP server).
- Matribox II Pro: a write the unit answers for another parameter of the same block is refused at
  once with that said, not after 3 s; a write that fails names its block, model, parameter and
  value ("Block 3 (CAB …), Low Cut = 80: …") and logs the frame sent and the unit's last 10
  messages to the console. The timeout, rollback and loop-guard messages read in Portuguese too.
- Matribox II Pro: **a failed write no longer piles blocks up on the unit.** The owner's assistant
  run ("timbre do Slash em Sweet Child", Claude Haiku, then Sonnet on an empty preset) ended with
  12 blocks on the unit (the planned WAH, AMP, CAB, DLY, RVB three times over) while the editor
  showed none: a value write timed out after the unit had applied the adds, the editor kept its
  old chain, and each retried `build_tone` was planned from that stale chain and added everything
  again, until the unit refused a block for memory and switched every block off. Now a whole chain
  (assistant, Undo, Redo) is planned from the preset read from the unit just before; a value or
  switch the unit already holds is not written (fresh blocks need only the values the tone sets);
  and a failed write puts the unit back to the chain it had, reads it again and tells the
  assistant nothing was applied. A set param or on/off is confirmed by the echo of its slot and
  parameter with whatever value the unit kept (it snaps values to the step), and the link no
  longer sends its knob-flush read while a request waits for its answer.
- Matribox II Pro MCP: `matribox_build_tone` puts the old chain back when a write fails.
- Tone assistant: **the same tool failing twice in one message stops the message** and says which
  tool failed and why, instead of retrying until the step limit; the step limit now says what to
  do (ask for one thing at a time). Claude's dated model ids (`claude-haiku-4-5-20251001`) find
  their price, so the answer's cost shows; "Real usage" links the paid providers' pages too; and
  the privacy note names the providers that really get the text (Claude included) instead of
  "Groq or Google".
- Matribox II Pro: **the patch-volume knob (knob 3) turned on the unit now follows at once too.**
  The link let held knob notices out with a patch-volume read, but the firmware holds a notice
  while the same one (cmd and first word) repeats, so that read's answer could not push out a held
  volume notice, and volume notices did not start the flush at all. The link now sends the
  preset-tempo read instead (`mbReadPresetTempo`, flag 1, cmd 0x10, `04 00 05 01`: a pure read the
  firmware answers through its notice queue, waveod sub 0x01050004; not captured), for knob 1/2
  and knob 3 notices alike, with the same bound (every 50 ms, stopping after 10 quiet reads). Its
  answer is no notice, so it reaches nothing in the editor: no "edited" mark, no re-read. Against
  the firmware-queue simulation (a step every 20 ms for 1 s), knob 3's worst lag goes from 309 ms
  to 29 ms and its last step from 149 ms to 19 ms; knobs 1/2 are unchanged (29 ms, 19 ms).
  Not yet checked on the unit.

## [1.2.0] - 2026-11-26

The Matribox II Pro gets its tones made by AI end to end. NAM captures convert into the CLONE
slots the official editor's way and upload from the editor's new Clones panel (on the owner's
unit, our clone of a capture sounded the same as the official editor's), and the tone assistant
can now set footswitches, CTRL 1-4, the expression pedal and the quick knobs, keeps chains within
an estimated DSP budget, and starts the drum machine. The editor gains Global options (inputs,
AUX, global EQ, Global Tempo, MIDI, USB audio, clock), a drum machine panel, user IR and clone
renaming, follows knobs turned on the unit at once, and the desktop app serves the editor's tools
to an AI over a local MCP connection. Protocol facts and the clone fit come from, or were checked
against, zxmarcos/waveod and zxmarcos/matribox-studio (MIT; see THIRD_PARTY_NOTICES.md). Matribox
writes added in this release follow those sources and were not all captured on a unit yet.

### Added

- Matribox II Pro: **drum machine for practice.** A *Drum machine* panel plays or stops it and
  picks style and rhythm (the unit's 8 styles and 100 rhythms by name), tempo, following the preset
  tempo, and volume, read back from the unit and following what changes on it. The tone assistant
  gets `set_drums` ("play a rock beat at 100 BPM": rhythm, BPM and play in one call) and the MCP
  server `matribox_set_drums`. Core: `mbWriteDrum` (flag 1, cmd 0x11, subs 0x81..0x86; posted, as
  the unit leaves some unanswered, then the state read with cmd 0x13 and checked), `drumChange`
  notices, `MB_DRUM_GENRES` / `MB_DRUM_PATTERNS`. From waveod's firmware rebuild; not captured.
- Matribox II Pro: **more Global options**, the less used in folded groups: Auto CAB and Bank select;
  USB audio (recording and monitor levels, AUX IN to USB, recording L/R dry or processed); EXP 2
  jack (pedal, one or two footswitches) and the external footswitches' functions; MIDI output
  channels (off, Omni, 1..16), clock source and clock out (TRS, USB). Each is one echoed write
  (`mbSetGlobal`), layout from waveod; not captured. USB mode, language, display and standby are
  left out.
- Matribox II Pro: **rename a user IR** in the new *User IRs* panel (flag 2, cmd 0x14, unanswered,
  checked by reading the names back; `mbWriteIrName`), and `matribox_rename_ir` in the MCP server.
- Matribox II Pro: **NAM captures into the CLONE slots.** The editor's Clones panel lists the 10
  slots by name, takes a `.nam` (converted with `generateMatriboxClo` in a web worker, about 35 s,
  with progress and Cancel) or a ready `.clo`, plays it through a simulated CLONE block to refuse
  one that is silent, far too loud or broken, and writes it to the chosen slot only after a
  confirmation (an overwrite cannot be undone: the unit cannot send a capture back). The tone
  assistant's `upload_clone` (a link the person gave or a TONE3000 tone; also `search_tone3000` and
  `list_clones`) opens that panel filled in, and only the person's confirmation writes; the desktop
  app's AI connection offers it as `matribox_upload_clone`. The MCP server gets its own
  `matribox_upload_clone` (a file in `~/.pocket-master-editor/nams`, an https link or a TONE3000
  tone; confirm `CLONE<slot>`, an occupied slot only with `replace: true`; the conversion runs in a
  worker thread). Core: `mbUploadClone` (flag 1, cmd 0x18, 49 pages, status 1 checked, the rename
  flag 2 cmd 0x18 from waveod, names read back), `simulateClo` / `checkClo` / `cloProbe` (a port of
  waveod's bit-exact firmware CLONE block, 98 dB under its output on a random capture), and
  `generateMatriboxClo` reports progress. Experimental: no upload of ours is checked on the unit yet.
- Matribox II Pro: the AI tone assistant (web and the desktop AI connection) can make a tone
  live-ready. New tools `get_controls` and `set_controls` (footswitch toggling a block, footswitch
  function, CTRL 1-4 membership, expression-pedal entry with heel/toe %, quick knob on a parameter,
  BPM or the patch volume), every change checked before anything is sent (footswitch A..D, CTRL
  1..4, knob 1..3, entry 1..9, block and parameter names, min <= max). MCP: new
  `matribox_assign_ctrl`, `matribox_set_footswitch_function`, `matribox_assign_quick_knob`;
  `matribox_get_assignments` also lists footswitch functions, CTRL groups and quick knobs.
- Matribox II Pro editor: the footswitch panel is now **Footswitches and CTRL** (what each
  footswitch runs in stomp mode, and the blocks in CTRL 1-4), and a new **Quick knobs** panel.
- Core: `mbAssignments` decodes sections 2 (quick knobs), 3 (stomp-mode footswitch functions) and
  8 as CTRL 1-4; new writes `mbSetFootswitchFunction` (`01/02 00 03 01`), `mbAssignQuickKnob`
  (`01 00 02 01` target, `02 00 02 01` parameter), `mbFootswitchToggleWrites`,
  `mbAssignmentsText`, `MB_FS_FUNCTIONS`. Layouts and writes from zxmarcos/waveod's reimplemented
  firmware (MIT, see THIRD_PARTY_NOTICES.md); not captured from the official editor nor checked on
  the owner's unit yet. The simulated unit takes them.
- Matribox II Pro: **NAM -> clone (.clo) conversion the official editor's way** (core
  `generateMatriboxClo`, `packages/core/src/clo/startclone.ts`), a TypeScript port of waveod's
  reconstruction of the editor's `HTKPA::startClone` (github.com/zxmarcos/waveod, MIT, Marcos
  Medeiros; see NOTICE). The model runs once over the 70 s reference DI at the `.nam`'s own
  `sample_rate` (prewarmed on silence like NeuralAmpModelerCore), its output x 0.31 kept at
  16 bits; the saturator comes from the rising sine's peaks, IR 1 and IR 2 from the quiet-noise,
  loud-sweep and pink-noise passes of `iterAmpCoeff` and a last IR 2 correction over the music,
  both resampled to 44.1 kHz with our r8brain port. On `5 RECTIFIER.nam` against the official
  editor's own `.clo`: saturator gains within 0.4 % (were 35-93 % off), arrayB within 0.5 dB per
  1/3 octave from 40 Hz to 12.5 kHz (was up to 14.6 dB), arrayA's shape within 0.5 dB from 160 Hz
  to 4 kHz (was up to 22 dB) but its level still about 4 dB under the official's. About 35 s on
  an Apple-silicon Mac for that model (the model run is most of it; the fit about 2 s). Not yet
  heard on the owner's unit; the Pocket Master's converter is
  unchanged. `.nam` parsing now reads `sample_rate`, and a `.clo` can carry its own IIR 2.
- Matribox II Pro: **estimated DSP load** under the chain ("Estimated DSP load: 74%", a meter, a
  note from 85% and a warning past 100% or with more than 2 CAB/IR/CLONE blocks), after a
  12-block preset made the owner's unit show "System overloaded". The unit sends no load, so it is
  an estimate from the block types: measured stock costs for AMP, CAB/IR and CLONE and the
  1 ms chain budget from zxmarcos/matribox-studio and zxmarcos/waveod (MIT), our deliberately high
  guesses for the other modules (docs/matribox.md, "DSP load"). The tone assistant's `build_tone`
  and `edit_preset` and the MCP `matribox_build_tone`, `matribox_add_block` and
  `matribox_set_model` refuse a chain past the limit before sending anything, saying what to drop,
  and note when one is near it; the preset text the assistant reads carries the estimate. The
  unit's own overload notice (cmd 0x11 `00 07`: DSP or memory) is shown when it arrives. Core:
  `mbDspLoad`, `mbCheckDspLoad`, `parseMbNotice` `kind: 'overload'`; the simulated unit refuses a
  third CAB/IR/CLONE and, with `cpuOverload`, switches every block off past the estimate. Not yet
  checked on the owner's unit; THIRD_PARTY_NOTICES.md credits both projects.
- Matribox II Pro, Global options: Global Tempo can be switched and its BPM set (40..300); when
  the unit does not confirm the switch, the editor says to accept it on the unit's screen (the
  unit asks there first, and answers 0 while it has no BPM). All four global EQ band gains are
  writable (words 10, 14, 18, 22), MIDI Input Ch (TRS) is offered beside USB, and Brightness and
  the low and high cut frequencies are shown. Core: the general table gives `brightness`,
  `midiInTrs`, `midiInUsb`, `tempoOn`, `tempoBpm`; the EQ table gives `lowCut`, `lowShelf`,
  `bands`, `highShelf`, `highCut`; `parseMbNotice` decodes the cmd 0x13 drum machine state
  (`kind: 'drum'`, not shown). Protocol facts cross-checked against zxmarcos/waveod and
  zxmarcos/matribox-studio (MIT); the new writes are not captured from the official editor and not
  yet checked on the owner's unit.
- Matribox II Pro: **Global options** (the header, beside the preset file buttons; on a phone
  under ⋯). Decoded from the owner's captures of the official editor's global settings window
  (mb-30 … mb-39): Input Mode, Input Level, AUX Level, footswitch mode (Preset / Stomp), MIDI
  Input Ch (USB), MIDI In Source (USB Only and Mixed: TRS Only is not offered, it would stop the
  editor's tuner and tempo Control Changes), the global EQ's switch, level and band 2 gain, each
  one write the unit confirms (newest value only while a slider moves; on an error the settings
  are read again). Read on connect; Global Tempo is shown read-only (the unit asks for a
  confirmation on its own screen before enabling it). The tuner and tempo controls follow the
  unit's MIDI channel. Core: `globals.ts` (`mbReadGlobalState`, `mbSetGlobal`,
  `mbSetGlobalEqGain`, `mbSetGlobalEqLevel`, `mbWriteGlobalEqOn`, the table parsers), byte-exact
  with the captured host frames, and `MatriboxLink.ask` for answers that do not repeat the
  request; the simulated unit answers and follows the global reads and writes. Not yet checked on
  the owner's unit.
- Matribox II Pro: the editor follows more of what is done on the unit (captures mb-37, mb-42,
  mb-44): a global setting or the global tempo changed on the unit updates Global options, a
  model changed on the unit (the chain notice) reads the loaded preset again once per burst, and a
  save made on the unit updates the preset list and the header. The expression pedal's message
  (mb-43) carries no position and is still dropped, like every unknown kind.

- Desktop app: **AI connection** ("Conexão da IA"). The app serves the editor's tone tools as MCP
  over Streamable HTTP on `127.0.0.1` (port 47830, or a free one when that is taken, shown in the
  panel), so an AI client such as Claude Code drives the same live session as the window: one
  owner of the MIDI port, every AI change on screen at once, and the editor's Undo covers it.
  The tools are the tone assistant's (core `CHAT_TOOLS` for the Pocket Master under their stdio
  names, the Matribox assistant's with the `matribox_` prefix, plus `which_pedal`); with no pedal
  connected they answer with an error. Off by default; the switch persists in the app's user
  data and turning it off closes the server. A panel (desktop only, not on the web or the PWA)
  shows the endpoint, the masked token with Copy and Regenerate, the last request time and the
  `claude mcp add --transport http …` command. Security: loopback bind only, a 256-bit bearer
  token compared in constant time (401 without it), Host allowlist and refusal of any request
  with an Origin (DNS rebinding, CSRF), no CORS headers, a 1 MiB body cap and rate limiting, and
  the token is never logged. Saves need the typed `confirm` and then the person's Allow in a
  native approval dialog. Electron gets a sandboxed preload exposing only this bridge. Unit tests
  for the checks, an in-process integration test through the real MCP SDK client (401, Origin,
  success, Deny), web tests of the bridge and an e2e of the panel and of an AI edit undone in the
  editor. The stdio npm package is unchanged. README, README.pt-BR and SECURITY.md document it.

- Web: search metadata so the site can be found by people looking for a Sonicake Pocket Master or
  Matribox II Pro editor. The page now has a `title` ("OpenSonicX: Sonicake Pocket Master &
  Matribox II Pro editor"), a description naming both pedals, `keywords`, `applicationName`, a
  canonical URL, `robots` index/follow, Open Graph `siteName` and locale (`en_US`, alternate
  `pt_BR`), schema.org `SoftwareApplication` JSON-LD (free, MIT), and `robots.txt` and
  `sitemap.xml` generated by the static export from `SITE_URL` and the base path. The PWA
  manifest name and description mention both pedals. Shared strings live in `apps/web/lib/seo.ts`.
  No affiliation with Sonicake is claimed. The GitHub Pages site only picks this up at the next
  release tag.

- Matribox II Pro: `apps/mcp/scripts/mb-capture.ts`, an offline decoder for MIDI Monitor captures
  (`.mmon`, read with a small bplist00 reader; no MIDI port is opened). `decode` prints every
  message both ways (frame type, flag, cmd, length, data, and the `parseMbNotice` reading of the
  unit's notices), joining pages and unwrapping LZO1X with core's own code. `diff` compares the
  global tables (unit replies to cmd `11`, `13`, `16`) of each capture's last read-back with a
  base capture, byte by byte and as u32/float32 words, and lists the capture's host writes (a
  drag's stream collapsed to its first and last); with one file it compares that file's first
  and last read-backs. `notices` lists what the unit sent on its own (replies and echoes of a
  host message are left out). Documented in docs/matribox-captures.md for the mb-30 … mb-44
  session; unit tests on synthetic messages.

- Matribox II Pro: the editor follows what is done on the unit itself. Core `parseMbNotice`
  decodes the messages the unit sends on its own (another preset loaded, one block or every
  block's on/off, knob 1/2 parameter turns, knob 3 patch volume, the "preset edited" flag), from
  the owner's captures; `MatriboxLink.onNotice` hands them over, between requests too, after the
  link has taken its own answers (the preset-change notice has the select echo's bytes). The web
  editor re-reads the loaded preset once when the unit loads another (the unit says it twice) and
  shows block, knob and volume changes without a read. Docs: the global settings tables (cmd
  `11`, `13`, `16`) analysed as far as the captures allow (no parser or write: no capture changes
  a global), and a capture list to settle them.

- Matribox II Pro editor: a tone library, like the Pocket Master's. *Keep tone* reads the edit
  buffer from the unit and keeps it in this browser under a name (the loaded preset's by default)
  and notes; *Load* sends a kept tone's chain (models, on/off, values) to the loaded preset as one
  Undo step, through the editor's validated writes, and never writes a slot. Tones can be renamed
  and deleted, and the whole library exported to and imported from one JSON file
  (`matribox-library.json`; a file that is not one is refused). It has its own storage key,
  `pocket-master-editor.matriboxLibrary.v1`, with every storage access guarded; a tone of the
  same name is replaced. Loading needs the model catalog, which gives each model's parameters.
  The Matribox tone assistant keeps and loads tones through it (`list_saved_tones`,
  `load_saved_tone`, `keep_tone`, mirroring the Pocket Master's tools), and its first message
  lists the kept tones with the gear their models are based on. The list-in-localStorage code is
  now one small helper (`localList`) both libraries use; the Pocket Master's library keeps its
  key and behaviour.

- Matribox II Pro editor: drag a chain tile to a new place, as on the Pocket Master's strip. A
  drop is one move-block write to the unit, then the usual read-back; a blue line shows where the
  tile lands, the ADD tile neither drags nor takes a drop, and Undo covers the move like an arrow
  move. Touch screens keep the arrows (a swipe still scrolls the strip). The drag code is now
  one hook (`useTileDrag`) both pedals' strips use; the Pocket Master's behaves as before.

- Matribox II Pro editor (web and desktop): one preset as a file. *Export preset* reads the
  loaded preset from the unit (unsaved edits included) and downloads it as `<label> <name>.prst`,
  the format Sonicake's own app opens (`writeMatriboxPrst`). *Import preset…* takes a `.prst` (or
  the editor's / MCP server's backup of one slot, `.json`), shows its name and chain (models from
  the catalog when it is there), lets you choose the slot (the loaded one by default, 1A..60D)
  and asks for an explicit confirmation: the unit stores a whole-preset write at once. The slot
  is loaded and what it stores kept in the editor's Matribox backups first; then the preset is
  written whole and read back (sections 2, 3, 4, 5, 7, 9), and the slot stays loaded. A failure
  leaves the backup in the list. A file that is not a Matribox preset is refused, and a Pocket
  Master `.prst` (a different format) is named as such. Until now only the MCP server
  (`matribox_export_preset`, `matribox_import_preset`) handled single presets.

### Changed

- Matribox II Pro, core: `mbAssignFootswitch` is now `mbAssignCtrl` (same bytes): section 8 holds
  CTRL groups, which footswitches A-D run by default (FS A = CTRL 1). `MbAssignments.footswitches`
  now holds each switch's press/hold function; the slots are in `ctrl`.
  `matribox_assign_footswitch` goes through the CTRL the switch runs (a switch on another
  function is set to its own CTRL first). `mbExpressionWrites` refuses min above max.
- Matribox II Pro: the model catalog is built in, in the web app, the PWA, the desktop app and the
  MCP server; nothing has to be installed, picked or loaded. Core exports `MB_CATALOG`, built from
  `packages/core/src/matribox/models.json` (our clean functional map: module and model ids, our
  category, the real gear each model is based on without trademark signs, and per parameter its control
  name, id, range, step, default and the labels of a switch or list) and `model-text.json` (our
  own short model names and descriptions in English and Portuguese). `scripts/matribox-map.mjs`
  writes `models.json` from a local copy of the official editor's file (the gear as plain text on
  one line, without other makers' product names; none for the source's own algorithms) and
  refuses to emit its
  descriptions, parameter help, notes, legal notice block or display names; the schema is in the
  script and in docs/matribox.md. Each model shows our name with "Based on …" / "Baseado em …"
  next to it, and its description in the language of the UI (block panel, assistant); the model
  menus and *Add* keep the grouping by type, and a list parameter's selector shows its labels.
  The MCP `MatriboxSession` takes the catalog as an optional last argument (default
  `MB_CATALOG`) instead of a loader. Tests check the map has none of the forbidden fields, every
  model has our text with unique names carrying no brand or model token, and the e2e run on the
  built-in catalog in English and Portuguese with no file picker or `alg_data` text anywhere.
  NOTICE and the READMEs say that names of real gear belong to their owners and are used only
  to describe the sound.

- Matribox II Pro editor on a phone: Export preset, Import preset… and Read fold under a ⋯
  *More actions* button in the preset header, so Undo, Redo, Save… and the patch-volume knob
  stay on one row. Wider screens show the buttons as before. The import dialog now lives on
  `<body>`, so it opens from the folded menu too.

- The Matribox II Pro editor now looks like the Pocket Master's. The chain is a strip of pedal
  tiles (module drawing and colour, model, an LED that switches the block, arrows to move it, a
  last tile to add a block) that scrolls by touch, mouse wheel or its ‹ › buttons. One panel
  shows the selected block: the same two-column model menu (model, and the real gear it is
  based on from your catalog, grouped by module), an on/off switch, Remove, and each parameter
  as a knob, a switch (0..1) or a small selector (a few steps), with ranges other than 0..100
  under the knob. AMP blocks wear the Pocket Master's amp finishes, chosen from the model's
  `origin` in your catalog (Marshall, Fender tweed and blackface, Mesa/Boogie, Vox, Soldano,
  5150, ENGL/Diezel, boutique, Roland JC, bass amps; a plain plate otherwise). DRV is red and
  DYN light blue, as on the unit; the other modules follow the Pocket Master's colours. The
  preset header has the big label and name, the style tag, Undo, Redo, Save and Read, and the
  patch volume as a knob; the sidebar groups the 240 presets by bank and folds away on a
  phone. Footswitches A-D are cards of block chips, the expression entries are grouped as EXP 1
  mode A, mode B and EXP 2 in a folding panel, and the experimental notice is a one-line banner.
  Without the catalog the chain keeps its colours and a block shows its raw stored values. What
  is sent to the unit is unchanged.
- Matribox II Pro editor: a block's model menu lists only that block's module (a DRV block,
  only DRV models), grouped under the model types of your catalog (Overdrive, Fuzz, …) in the
  catalog's order, with no heading for a module of one type; IR and CLONE models show the name
  of the user IR or capture in their slot. The *Add* tile now asks in two steps: first the block
  type (each module with its drawing and colour), then that module's models grouped the same
  way; *Back* or Escape returns to the types. Without the catalog *Add* still lists the modules,
  and offers the models the chain already uses, by id.
- Model menus (both pedals): group headings are drawn in the secondary label colour, which
  meets WCAG AA contrast, and the open list takes keyboard focus in the tab order, as an
  accessibility checker expects of a scrolling region. Nothing else changes in the Pocket
  Master's menus.
- Internal: the Matribox II Pro request/answer link (IR upload included), the simulated unit the
  tests run against and the catalog name/range checks now live once in `packages/core`; the MCP
  server and the web editor import them instead of keeping their own copies. No behaviour change.
- Matribox II Pro editor: the chain no longer scrolls sideways. Its tiles, a little smaller (still
  the drawing, the module, the model and the on/off bar), wrap into rows that each read left to
  right, and a cable drawn behind them runs through every row and bends from the end of one row
  down and back to the start of the next, as on a Helix. A full chain (12 blocks and the *Add*
  tile) fits on two rows on a desktop and wraps onto more rows on a phone, with *Add* always last
  and on screen. Selection, drag (one move per drop, with Undo), the arrows, the two-step add
  menu and the phone sheets work as before; on a phone a swipe over the chain now scrolls the
  page. The Pocket Master's strip is unchanged.
- Dependencies: Biome 2.6.6 → 2.6.8 and Turbo 2.11.10 → 2.11.13 (#213), and
  `docker/setup-buildx-action` v3 → v4 in the CI and release workflows (#212).
- Matribox II Pro: the real gear behind 13 models was checked against the vendor's own model lists
  (Sonicake Matribox II Pro manual V1.2.2). Corrected: the blue-channel amp is a Bogner XTC (not
  Ecstasy), the Supro 2x12 is the 1624T, the US 2x12 is the Piggyback Bassman, the Lonestar spelling,
  and the Hiwatt 4x12 is the SE4123. The acoustic "Square Dread" had no stated brand, so its guessed
  attribution was removed.

### Removed

- Matribox II Pro: every way to load or choose the catalog file: the web app's *Choose
  alg_data.json* / *Replace* / *Forget* panel and line (`MatriboxCatalog.tsx`,
  `lib/matriboxCatalog.ts`, its IndexedDB store, which is cleared once), the "catalog required"
  states of the add menu, the block panel, the assistant and the tone library, and their
  messages; the desktop app's `app://editor/matribox-catalog.json` route
  (`apps/desktop/src/matribox-catalog.ts`); the MCP server's lookup of the official app's install
  and the `MATRIBOX_CATALOG` variable (`apps/mcp/src/matribox-catalog.ts`); and core's
  `parseMbCatalog`.

### Documentation

- README, README.pt-BR and `docs/matribox.md`: the Matribox II Pro editor's current look and
  features (snake chain, drag to reorder, ⋯ menu on a phone, following the unit, tone library),
  with what is checked on the owner's unit and what is not yet. README media is unchanged: the
  media script covers the Pocket Master only.

- `docs/matribox.md`: how the official editor converts a NAM capture into a Matribox CLONE
  `.clo`. Calling the installed editor's converter rebuilds the captured upload byte for byte.
  Its reference DI is the same as ours, and its fit is a different, single-level algorithm.
  The doc also covers why no `matribox_load_capture` ships yet and what would unblock it.

### Fixed

- Matribox II Pro: the estimated DSP load no longer reads past 100 %: a chain over the budget
  says "over the limit", and its bar is drawn (full and red) instead of a `<meter>` that showed
  empty in the dark theme.
- Matribox II Pro: **a knob turned on the unit now follows in the editor at once.** The unit's
  firmware holds back a repeated knob notice (the newest kept) until 150 ms pass without one or 10
  are held (stock FUN_0003568C, as zxmarcos/waveod reimplements it; capture mb-42 got a gain knob
  0.4 s and 3..4 steps apart), but sends the held one first when it has any other notice to send.
  While knob notices come, the link (`matriboxLink`, when a notice handler is set: the web editor) now sends the patch-volume read
  (`mbReadPatchVolume`, `03 00 05 01`, answered through that same queue) every 50 ms and stops after
  10 reads that bring none: about 20 small frames a second, only while a knob turns. Against a
  simulation of the firmware's queue (a knob step every 20 ms for 1 s) the worst lag goes from
  309 ms to 29 ms and the last step from 149 ms to 19 ms; the web editor shows a knob notice
  within 2 frames, without a preset read, and the read's answer (the same volume) does not mark the
  preset edited. Not yet checked on the unit: if the stock firmware does not answer that read, the
  follow stays as before.
- Matribox II Pro, Global options: footswitch mode was read inverted (byte 35 is 0 Stomp,
  1 Preset); the MIDI channel the editor wrote (`00 61`) and read (byte 36) is the TRS input, not
  USB: USB is `01 61`, byte 38, and the tuner and tempo Control Changes now follow it; the EQ words
  3..6 and 23..26 are the low and high shelves, not the cuts (the cuts are words 0..2 and 27..29).
  Switching the global EQ to the state it is in no longer waits for an answer the unit never sends.
- Matribox II Pro model names and texts: the cabinets, EQs, delays, reverbs and pitch/filter
  models no longer show numbered placeholders ("4x12 #25", "EQ-A", "DLY-T", "VERB-1",
  "SIMPLE-1"), and three reverbs whose names had slipped one place (Church, Plate, Spring) now
  carry their own. Every cabinet has a meaningful name (e.g. "Tweed 1x12", "Brit Lead 4x12",
  "Fridge 8x10"), the EQs are named by purpose ("Guitar Mid EQ", "Bass Wide EQ"), and the
  descriptions say the character, the best use and the actual controls (bands and ranges, Low
  Cut/High Cut on cabinets). The remaining numbered names in DYN, DRV and MOD (GATE-1, DIST-1,
  CHOR-1, TREM-2…) were renamed too. `model-text.json` gains an optional `gear` field, the real
  gear in plain text, which the model menus' right column and "Based on" show in place of the
  source's origin; 43 models have one. The generator (`scripts/matribox-map.mjs`) prefers that
  field and no longer lets an IR file name (the "IR Cab: 39" kind), an original, another maker's
  product name or non-Latin text through as gear; `models.json` regenerated. New core tests:
  no gear is an original, an IR file, another maker's product or a bare number, and no model
  name is a numbered placeholder.
- Matribox block panels: the knobs of a row no longer sit at different heights. Knobs showing a
  range caption ("0 … 500") were taller than the ones without, and the row's `align-items:
  flex-end` pushed the shorter ones (and the switches and selectors, e.g. DYN Threshold/Ratio,
  RVB Trail) down. A panel with range captions now gives every control the same four rows (value,
  64 px dial area, label, caption) and top-aligns them, with a switch or selector centred on the
  dial row, so dials and labels share one line per wrapped row, on desktop and phone. The caption
  also got its own small style. The Pocket Master panels, which have no captions, are unchanged.
  New e2e `matribox-knob-align.spec.ts`.
- Web e2e under parallel load: the axe and pixel-contrast tests (`a11y.spec.ts`) timed out at 30 s
  when many workers shared the CPU, and passed alone. Cause: `e2e/contrast.ts` shipped every pixel
  of every screenshot to the page as a JS array of arrays and sorted it there, and added a new
  `<style>` tag per element measured, so each contrast pass was CPU and GC heavy and slowed axe
  too. It now reads the typed pixel buffer, sorts a `Float64Array`, and adds the style once per
  page; the a11y specs also run with `test.slow()` (3x timeout), since axe is CPU-bound. CI
  behaviour is unchanged. The `phone › portrait` screenshot case in `matribox-screens.spec.ts`
  waits for the Read button with `includeHidden`, as it lives in the folded More menu on phones.
- Pocket Master editor, keyboard: the file-import buttons (*Import preset*, *Import a backup*, the
  NAM and WAV loaders) are a transparent input over a button, so Tab reached them with no visible
  focus. The button now shows the focus ring (`:focus-within`); the input and its tests are
  unchanged, and Enter and Space still open the picker.
- Pocket Master editor, light theme: an off block's knob labels and values were below WCAG AA
  because the whole parameter row sat at 55% opacity (axe flagged an off RVB block). Now only the
  dials and switches dim and the values turn grey, as on the Matribox; the text keeps AA. The
  a11y e2e checks an off AMP and an off RVB block in both themes.
- The Matribox editor no longer logs a refused import file as an error in the browser console: a
  wrong file is the person's mistake and the dialog already says so (it also showed in the e2e log).
- Matribox editor, keyboard: *Import preset…* (in the header and in the phone's folded ⋯ menu),
  *Restore all…* and the catalog's *Choose alg_data.json* were a `<label>` around a hidden file
  input, which Tab skipped. They are buttons now (`FileButton`) that open the file picker with
  Enter or Space. The Pocket Master's import was already reachable (its input is overlaid, not
  hidden) and is unchanged; an e2e test now checks it.
- Matribox editor, light theme: an off block's knob labels read at 2.34:1 (the whole parameter row
  was at 55% opacity). The dials and switches still dim, the values turn grey, and the text keeps
  WCAG AA (4.5:1). The axe check now runs on an off block in both themes.
- Matribox editor at 721–900px: the patch-volume knob no longer drops onto a row of its own when
  the buttons are long (Portuguese at 721px): the buttons wrap among themselves beside the knob.
- Matribox add menu: back from the models ("Back to block types" or Escape), the type chosen
  before is highlighted and the list focused, instead of starting over at the top.
- Matribox add menu on a desktop: it hangs under the ADD tile wherever the chain's last row ends,
  moved left only as far as it takes to stay on screen, instead of at the chain area's right edge.
  Phones keep the bottom sheet.

## [1.1.0] - 2026-11-24

The Matribox II Pro grows from "opens and edits" to a full second pedal, all of it run on the
owner's unit: whole presets in one write (import, export, restore), backup and restore of all
240 presets in one file, user IR upload, patch volume, footswitch and expression-pedal
assignments, the tuner, tempo, looper and drum machine over MIDI CC, and a tone assistant with
undo/redo in the editor. The web editor installs as an app and works offline (PWA), NAM
captures convert 2.5x faster, and the code is now linted and formatted by Biome and built
through Turborepo. Matribox writes stay experimental (one unit so far); loading captures (NAM)
on the Matribox is not available yet.

### Added

- Matribox II Pro `matribox_load_ir` (experimental, checked on the owner's unit): loads a
  WAV (44.1 or 48 kHz) from `~/.pocket-master-editor/irs` into user IR slot 1..20, as the official
  editor does. `confirm` repeats `IR<slot>`; a slot whose name is not the default `User IR n` is
  only overwritten with `replace: true` (the unit cannot send an IR back). It waits for the unit's
  flag-3 acknowledgement and reads the slot names back. The upload's checksum is decoded (byte sum
  of slot, zero, name field and the first 1366 converted samples) from two more captures of WAVs
  made for it; core gains `mbIrUploadData` and `mbIrUpload`, which rebuild the real IR's captured
  upload frame for frame and the other two byte for byte. The simulated unit acknowledges uploads.
- Matribox II Pro backup all / restore all, as one file (format `opensonicx-matribox-backup`,
  version 1, documented in docs/preset-file-format.md): all 240 presets (1A..60D), each read with
  its slot loaded, then the loaded preset loaded again; restore checks the whole file first, writes
  each preset whole into its slot (read back), stops at the first failure saying which slots were
  written, and loads the original preset again. By default all 240 presets are backed up first so a
  restore can be undone. MCP: new tools `matribox_backup_all_presets` (file in
  `~/.pocket-master-editor/backups`) and `matribox_restore_all_presets` (`confirm: "ALL"`,
  `backup` optional); the tool contract only gains entries. Editor (web and desktop): an "All
  presets" section with *Back up all presets* (asks first over unsaved edits, downloads the file)
  and *Restore all…* (file upload, explicit confirmation, backup-first box on by default,
  progress). Core: `mbBackupAllPresets`, `mbRestoreAllPresets`, `parseMbBackupAll`, `mbReadSlot`,
  `mbStoreSlot`, `mbReadLoadedIndex`; core's `matriboxLink` gains `writePreset`.

- The web editor is an installable app (PWA) that works offline: a web app manifest (name,
  icons, maskable icon, dark theme colors, standalone window, scoped to the GitHub Pages base
  path) and a small hand-written service worker that precaches the whole static export (pages,
  JS/CSS chunks, fonts, the NAM conversion worker, images) in one cache per release, named after
  the version and a digest of the files. A new release installs in the background and takes over
  only when you click *Reload* on the "new version" prompt, or on the next launch, never in the
  middle of an edit. Requests to other sites (AI providers, TONE3000) and your own data are never
  cached. The desktop app and `next dev` register no service worker.
- Matribox II Pro whole presets (experimental, checked on the owner's unit): the official
  editor's whole-preset write, decoded from a new capture of it importing a `.prst` (mb-20): one
  flag-2, cmd `10` message holding the u32 index and the 1207-byte body with the `.prst` section
  tags, paged at 183 bytes, answered with cmd `17`. Core gains `mbWritePreset`, `mbPresetBody`,
  host paging (`buildMbFrames`, `MB_HOST_PAGE_SIZE`) and `writeMatriboxPrst` (the inverse of
  `parseMatriboxPrst`: literal-only LZO1X, JSON byte array, base64). New MCP tools:
  `matribox_export_preset` (the loaded preset or a slot to a `.prst` in
  `~/.pocket-master-editor/presets/matribox`), `matribox_import_preset` (a `.prst` loaded into the
  loaded preset, optionally saved with confirm) and `matribox_restore_backup` (a
  `matribox_save_preset` backup loaded and saved back to its slot, with confirm). The write carries
  everything: chain, parameters, knob, expression-pedal and footswitch assignments, volume and
  tempo. Whether it also stores the slot is not known yet, so the loaded preset is backed up first
  and only a save stores. Paths stay inside their folders. The Pocket Master's
  `list_preset_files` skips the Matribox folder. The tool contract only gains entries.
- Matribox II Pro groundwork for loading user IRs (used by `matribox_load_ir`, above): the WAV ->
  IR conversion the official editor does (first channel, r8brain 1.6 resampling to 44.1 kHz,
  JUCE's 24-bit rounding, 1024 samples) reproduced sample for sample against a captured upload
  (`mbIrSamplesFromWav`, 44.1 and 48 kHz WAVs), and the IR upload's paged frames,
  rebuilt frame for frame with `buildMbFrames`. The capture (clone) upload format is
  documented, but the official NAM conversion differs from ours. Findings in docs/matribox.md.
- Matribox II Pro live controls (experimental, checked on the owner's unit), decoded from
  new captures of the official editor (mb-01 patch volume, mb-09 footswitch A, mb-04 expression
  pedal): core builders `mbSetPatchVolume` (`03 00 05 01` + u32), `mbAssignFootswitch`
  (`01 00 08 01` + switch + slot + 1/0), `mbAssignExpression` (`02 00 07 01` + entry + slot +
  param + 0 + f32 min + f32 max) and `mbSetExpressionMin`/`Max` (`03`/`04 00 07 01`), each
  byte-exact with the captured host frames; `mbAssignments` reads volume, tempo, footswitch rows
  and expression entries from a preset. The manual's MIDI Control Change table is restated in
  core (`MB_CC`, `mbControlChange`, `mbBpmControlChanges`) and the links gain `control()` (one
  CC, no answer expected). New MCP tools: `matribox_get_assignments`, `matribox_set_volume`,
  `matribox_assign_footswitch`, `matribox_assign_expression`, `matribox_set_expression_range`
  (assignments are read back after the write), `matribox_tuner`, `matribox_tap_tempo`,
  `matribox_set_bpm`, `matribox_looper`, `matribox_drum`, `matribox_ctrl`,
  `matribox_quick_knob`. The Matribox editor gains a patch volume slider, a footswitch grid, the
  expression entries and a tuner / tap tempo / BPM row, in English and Portuguese. The tool
  contract only gains entries.

### Changed

- Matribox II Pro: saving the loaded preset to **another** slot (`matribox_save_preset`, the
  editor's Save dialog) now loads that slot to back it up, writes the loaded preset (unsaved edits
  included) into it with the whole-preset write and saves only to rename it: **the target slot
  stays loaded** afterwards. Exporting a slot that is not loaded (`matribox_export_preset` with
  `preset`) loads it to read it and then loads the original preset again, so unsaved edits of the
  loaded preset are lost. Saving over the loaded slot is unchanged; its backup is the preset as
  loaded, marked `source: "edit-buffer"` in the backup record (`"slot"` otherwise).
- README for 1.0: both pedals in the introduction, the Matribox II Pro MCP write tools, Android
  checked, and a Portuguese version ([README.pt-BR.md](README.pt-BR.md)) linked from the top of each.
- Builds and tests run through Turborepo (`turbo`, local cache only): `npm test`,
  `npm run typecheck` and `npm run build` skip workspaces whose inputs did not change, locally
  and in CI (the cache is kept between CI runs with `actions/cache`). Releases always rebuild
  everything. See CONTRIBUTING.md.
- The code is linted and formatted by [Biome](https://biomejs.dev) (pinned, configured in
  `biome.jsonc`): `npm run lint` checks lint rules and formatting and runs in CI, `npm run format`
  rewrites files. The format matches how the code was already written (single quotes, semicolons,
  2 spaces, lines up to 200 columns); the one-time format pass is listed in
  `.git-blame-ignore-revs`. Lint fixes are unused imports and variables and equivalent rewrites
  (`type="button"` on buttons outside forms, `Math.PI`, template literals); no behaviour changes.
  See CONTRIBUTING.md.
- NAM capture -> captured-profile conversion is about 2.5x faster and uses half the memory
  (a real 23-layer capture: 57 s -> 22 s end to end on an M-series Mac, peak RAM 3.7 GB ->
  1.9 GB). The WaveNet pass now runs in cache-sized time blocks with 4-wide channel sums
  instead of streaming 12.8 MB rows per multiply-add, and the FFT hoists its twiddles. Every
  sum keeps the reference order, so the output is bit-identical to before (parity with
  SonicMaster unchanged). WebAssembly was measured out: on top of this it would gain about
  1.5x end to end, short of the 2x that would justify a second toolchain.
  `node packages/core/scripts/bench-clo.ts [capture.nam]` times each stage.

### Fixed

- The desktop app builds on Windows again: the script that writes the offline service worker
  (`apps/web/scripts/build-sw.ts`, added with the PWA) took file paths from `URL.pathname`, which
  on Windows is `/D:/...` and resolved to `D:\D:\...`; it now uses `fileURLToPath`. No released
  version was affected.
- Matribox II Pro expression pedal: the assignment's fields are group (EXP 1 A / B, EXP 2), position,
  slot and parameter, and the unit ignores the range sent with it (owner's unit). Assigning to any
  entry other than the first, or to a block outside slot 0, was refused before; now the editor and
  the MCP server assign with the full range and then set min and max, as the official editor does.
- Matribox II Pro: a preset read by index returns the loaded preset's edit buffer whenever that
  index is not loaded (confirmed on the owner's unit: an export of 58D gave the loaded 3B, the
  backup before saving to 59D held the loaded 60D). Every read of a slot that may not be loaded
  now selects it first, as the official editor does: the backup before a save to another slot,
  the export of a slot, and the backup before an import or restore (MCP and editor). Backups made
  before this fix of a slot other than the loaded one hold the loaded preset, not that slot. The
  simulated units model the bug.
- Matribox editor: the Save dialog no longer resets itself when the save loads another slot.
- Matribox II Pro: `matribox_import_preset` and `matribox_restore_backup` treat the whole-preset
  write as what it is on the unit, a write that stores the slot (owner's capture): both need the slot
  and `confirm`, back that slot up and load it before the write. Before, import without a slot
  wrote the loaded preset's slot without asking.
- A refused MIDI permission is no longer logged as an error in the browser console: it is the
  person's choice and the page already explains it (it also showed up in the e2e logs).
- Matribox II Pro host checksum: it covers the data nibbles only, not the length and offset bytes
  (the same on every single-page frame captured so far; a paged write shows the difference).

## [1.0.0] - 2026-11-24

First stable release, now **OpenSonicX**. The Pocket Master editor is validated end to end on
the owner's pedal, on desktop and on an Android tablet (USB and Bluetooth). The Sonicake
Matribox II Pro arrives as the second pedal, experimental: the MCP server reads and edits it
(every write checked on the owner's unit) and the web and desktop editors open it. The editor
connects by itself when the page opens or the pedal is plugged in, and the desktop app is
renamed OpenSonicX (it updates in place and keeps its data). The MCP tool contract is frozen
for 1.x.

### Added

- Groundwork for a second device, the Sonicake Matribox II Pro (no UI or MCP tools yet): the
  core builds and parses its SysEx frames (checksum, nibbles, paged replies), and the model
  catalog is read from the user's own install of Sonicake's official editor, never shipped here
  (`MATRIBOX_CATALOG` points to it elsewhere). See [docs/matribox.md](docs/matribox.md).
- Matribox II Pro: our own LZO1X decompressor (bounds-checked, output capped, verified against
  liblzo2), message unwrapping (every message is an 8-byte header plus an LZO1X stream), the read
  requests the official editor sends, and parsers for the preset names (240, with style tags), the
  20 user IR names and the 10 capture names.
- Matribox II Pro presets: `parseMbPreset` decodes a preset read from the unit (1211 bytes) or a
  `.prst` body (1207 bytes; `parseMatriboxPrst` reads the file) into name, style and the chain in
  signal order (slot, module, model, on/off, parameter values), keeping every section raw for a
  later writer; `resolveMbPreset` names models, the gear they are based on and parameters from the
  catalog, reading only the selected model's parameters. Read builders for the loaded preset
  (`mbReadCurrentPresetNumber`, `mbReadPreset`) match the official editor's requests byte for byte.
- MCP server: works with whichever supported pedal is plugged in, told apart by MIDI port name.
  New read-only tools: `which_pedal`, and for the Matribox II Pro `matribox_list_presets`,
  `matribox_get_preset`, `matribox_list_models` (the catalog with each model's real gear),
  `matribox_list_irs` and `matribox_list_captures`. Nothing is written to the Matribox yet. The
  Pocket Master tools are unchanged; the tool contract only gains entries.
- Matribox II Pro writes (experimental): core builders for every write the official editor sends
  (`mbSetParam`, `mbSetBlockOn`, `mbSelectPreset`, the chain edits `mbAddBlock`, `mbMoveBlock`,
  `mbRemoveBlock` and `mbChangeModel`, and `mbSavePreset`), checked byte for byte against our
  captures, and `parseMbPresetLabel`. New MCP tools: `matribox_set_param` (by parameter name,
  within the catalog's range), `matribox_set_module_on`, `matribox_select_preset`,
  `matribox_set_model`, `matribox_build_tone` (a whole chain of models and parameters in one call)
  and `matribox_save_preset` (confirm with the slot label; the slot is backed up to
  `~/.pocket-master-editor/backups` first). Each write waits for the unit's answer (its echo, or
  its chain notice after a chain edit; a save, which the unit does not answer, is checked by
  reading the slot back), and every write tool says its result is experimental.
  `matribox_add_block`, `matribox_remove_block` and `matribox_move_block` edit one block of the
  chain. Every write works on the owner's unit; change model names the block's storage slot, not
  its chain position (a block whose slot and position differed got the wrong block changed). `lzo1xLiterals` now encodes runs of any length.
- Matribox II Pro in the web editor and the desktop app (experimental): Connect tells the pedals
  apart by their MIDI port name and shows the Matribox's own editor; the Pocket Master's editor is
  unchanged (it stays first when both are plugged in). The Matribox editor lists the 240 presets
  (1A..60D) and loads one (asking first over live edits), shows the loaded preset's chain in signal
  order with each model and the gear it is based on, and edits it live: block on/off, parameters
  within the catalog's range, change model (picker grouped by module), add, move and remove
  blocks. Save to a slot asks for an explicit confirmation, keeps a backup of the slot in the
  browser first (downloadable, the MCP server's format) and checks the save by reading the slot
  back. The model catalog is the owner's own `alg_data.json`: picked once in the browser and kept
  there (IndexedDB), read from the official app's install (or `MATRIBOX_CATALOG`) by the desktop
  app; never bundled or fetched. Without it, presets and chains still show by module number and
  model id. Core gains `matriboxLink` (the request/answer rules over any MIDI port) and
  `pedalOfPort`; tests run against a simulated unit with an invented catalog.
- Matribox II Pro docs: an "Unknown sections" part in docs/matribox.md (the knob, expression pedal
  and footswitch assignment tables, patch volume, the unit's own messages, each with evidence and
  confidence) and docs/matribox-captures.md, the list of short captures that would settle the rest.
- Matribox II Pro editor: the tone assistant, with the same panel and keys as the Pocket Master's
  (your own free Groq or Gemini key, or a paid provider, called straight from the browser). The
  model gets the loaded preset and your catalog (each module's models with the real gear they are
  based on; parameter ranges in full for paid providers, through `list_models` on free plans),
  and answers with a whole chain (`build_tone`) or small edits (`edit_preset`); both are checked
  against the catalog, sent through the editor's validated writes and shown under "What changed".
  Saving only opens the editor's Save dialog, filled in, for you to confirm. Without the catalog
  the assistant says why it is off. The assistant code now runs over a pedal-neutral `ToneAgent`
  (web `lib/assistant.ts`); the Pocket Master's is unchanged.
- Matribox II Pro editor: Undo and Redo (buttons, ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y) for live edits:
  parameters (a knob drag is one step), on/off, model changes, add, move, remove, and each
  assistant answer as one step. A step is sent as the writes that turn the unit's chain into the
  one kept (values and switches alone, one chain edit, or a rebuild from the first differing
  block), with the same validated builders. Values of a model the catalog does not know are not
  restored.

### Changed

- The desktop app is now **OpenSonicX** (was *Pocket Master Editor*): app name, installers
  (`OpenSonicX-<version>-…`), the Linux executable and the update message. The app id is unchanged,
  so installed copies update in place, and the data folder keeps its old name, so backups, keys and
  settings stay. Browser storage keys, `~/.pocket-master-editor` and the Docker image keep their
  names. The update check in CI accepts both names.
- Web and desktop editor: no Connect or Disconnect button any more. On load the page asks for MIDI
  (silently when it was allowed before; the browser asks the first time), finds the plugged-in
  pedal by its USB MIDI port name and loads it: presets, chain, functions. Plugged in later, it is
  opened then; unplugged, the page waits calmly ("Plug in your pedal"); plugged back in, also after
  a power cycle, it is opened again with fresh ports, without a reload. With both pedals plugged
  in, the Pocket Master is opened first; a connection that is up is kept when the other pedal is
  plugged in, and the editor moves to the other pedal when the open one is unplugged. When the
  browser refuses MIDI (or wants a click first), one *Allow MIDI access* button asks again; Bluetooth
  keeps its button (the browser needs the click). After a factory reset the pedal is opened again
  once it reboots.
- Toolbar: the Input and Output port pickers are gone; a status chip names the connected pedal
  and how ("Pocket Master · USB", "Pocket Master · Bluetooth"), or says it is waiting for one.
  The header reads "OpenSonicX" plus the connected pedal, and so does the window title.
- Desktop app: MIDI with SysEx is granted to the editor's own page only, checked by scheme and
  host (the old prefix check also matched look-alike hosts), so it opens the pedal without a prompt.
- Core: the "could not send" error no longer says to click Connect.

### Fixed

- Android tablets and phones: a swipe over the signal chain scrolls it to the blocks off screen
  (FX, delay, reverb). On touch the blocks were draggable, so the swipe started a drag instead;
  there they now move with the arrows only (#92).
- The signal chain scrolls with a mouse too: ‹ › buttons at its ends while blocks are hidden,
  the mouse wheel scrolls it sideways (the page scrolls again once the chain reaches its end), a
  scrollbar big enough to grab, and dragging over the blocks no longer selects their names.

## [0.17.1] - 2026-11-23

Polish before 1.0: the README states every feature, no stray "No file chosen" tip, and the MCP
server's `delete_slot` confirms like every other tool that writes.

### Changed

- MCP server: `delete_slot` is confirmed with the slot's label (`"IR3"`, `"PROFILE2"`), like
  `load_ir` and `load_nam`, instead of the name the slot holds; every tool that writes now asks
  for the label of what it writes. `copy_preset` and `delete_slot` describe their `confirm`.

### Fixed

- Chrome no longer shows a "No file chosen" tip over the dialog a file picker opens (Import
  preset, Backups, captures and IRs).

### Documentation

- README: every feature in the editor is listed (undo/redo, copy, tuner, backups of all
  presets, `.prst` import, the preset library, paid AI keys), and the firmware line says the
  editor reads the version from the pedal (it has since 0.14).

## [0.17.0] - 2026-11-23

Import presets exported by Sonicake's own app (`.prst`), and the MCP server catches up with
the editor: copy, tuner, delete IR/profile and back up all presets.

### Added

- MCP server: `copy_preset` (backs the destination up first), `set_tuner`, `delete_slot`
  (a user IR or captured profile, confirmed by the name it holds) and `backup_all_presets`,
  so the assistant in Claude Desktop can do what the editor does.
- Import `.prst` preset files, the ones Sonicake's own app exports: Import preset (and Import in
  Backups) takes them next to our `.json` files, with the same "what changes" check before
  loading, and the MCP server's `list_preset_files` and `import_preset` read them from the
  presets folder. A name the pedal cannot store (longer than 10 characters, or not plain ASCII)
  comes in empty; the sound is kept.

### Fixed

- MCP server: `import_preset` is timed under its own name (it was logged as `export_preset`).
- Tone assistant: a short per-minute limit is waited out for exactly the time the provider
  states (the clock was read twice and could wait 1 ms less).
- Saving to a slot other than the loaded one no longer jumps the Save dialog back to its form:
  it shows "Saved", and a save the tone assistant proposed finishes its answer instead of
  staying on "Working on it…".
- Tone assistant: when it saves the tone to another slot, "What changed" still lists the changes.

## [0.16.1] - 2026-11-22

Editing is always live once the pedal is connected: no switch to turn on first.

### Removed

- The *Live edit* switch. Editing is always live once the pedal is connected: every change goes
  to the pedal's edit buffer at once, Undo, Redo and Revert are always there, and nothing is
  saved to a slot until Save. With it off the editor could only look; reading, saving, copy,
  backups and slots never needed it, and the owner had to turn it on every time. The tone
  assistant no longer asks to turn it on.

## [0.16.0] - 2026-11-22

**Delete, and keys on shared computers.** Captured profiles, user IRs and backups can be
deleted, each after a confirmation; deleting a capture or IR was checked on the owner's pedal.
The tone assistant can keep your AI keys for this browser session only, and forget them all at
once.

### Added

- Delete buttons for captured profiles, user IRs and backups, each behind a confirmation.
  Deleting a capture or IR sends the official tool's clear command (11 27 / 11 23, ported from
  SonicMaster and checked byte for byte against its capture of the official tool), then checks
  the pedal reports the slot empty. Checked on the owner's V1.3.3 unit: deleting, then loading
  new captures and IRs without a power cycle saved them, and they survived one. (SonicMaster saw
  the pedal refuse writes after a clear until a power cycle; the dialog says what to do if that
  ever happens.) Deleting a backup removes it from this browser, with *Download file* offered
  first.
- Tone assistant → Keys: *Remember keys on this device* (on by default) and *Forget all keys*.
  Keys were, and are, kept only in this browser and sent only to their provider; nobody who opens
  the site elsewhere sees them. On a shared computer, turning Remember off keeps them for this
  browser session only (sessionStorage), and Forget all keys removes every key at once. The "i"
  beside it explains this.

## [0.15.1] - 2026-11-22

Backups, clearer: each backup is a card with its actions in sight, importing one says what it
holds and highlights it, restoring takes no extra backup, and Restore all shows one progress
bar with its percentage.

### Changed

- Restoring in the editor (one preset or all) no longer backs up what it overwrites first
  (owner's request: a restore is a deliberate choice, confirmed in its dialog). The MCP
  server's restore, run by an assistant, still backs up first.
- Each backup in the Backups panel is a card with *Restore all* (or *Restore to Pxx*) and
  *Download file* in sight; *Show the 50 presets* opens its list to restore one preset. The
  backup list was easy to miss behind a click on its title.

### Fixed

- Restore all: one progress bar to the last restored preset, with its percentage, and a note
  to keep the pedal connected and the window open.
- Backups → *Import file*: importing a backup now says what it holds ("All user presets, 50
  slots, date") and opens it in the list, ready to restore one slot or all. Importing a file
  that was already in the list (the backup just made) used to change nothing on screen.

## [0.15.0] - 2026-11-22

**Your own paid AI, copy and the tuner.** The tone assistant now also takes paid keys:
OpenRouter, Claude, OpenAI, Gemini, Groq, xAI (Grok), DeepSeek, Mistral or Cerebras. Paid
providers get fuller requests (every model described, more thought about the reference's
actual rig), show what each answer cost, and you choose which provider answers first. The
editor can also copy a preset over another slot, turn the tuner on and off, and back up all
50 presets to a file and restore them, all checked on the owner's pedal.

### Added

- Tone assistant, **paid providers** with your own key (*Keys → Add a paid provider*):
  - OpenRouter, Claude (Anthropic), OpenAI, Google Gemini, Groq, xAI (Grok), DeepSeek,
    Mistral and Cerebras. The key is checked against its model list, a good inexpensive model
    is preselected (Claude Haiku, an OpenAI "mini", Gemini Pro…) and can be changed. Keys
    stay on this device (`aiProviders.v1`) and go only to their provider, straight from the
    editor and the desktop app; Claude uses Anthropic's own API.
  - Paid requests are fuller: every model's description and ranges, and instructions to
    think through the reference recording's rig and explain the choices. Free keys keep the
    compact requests that fit their limits. An "i" next to each section explains the
    difference.
  - **What each answer cost**, estimated ("Answered by Claude · about $0.003"), and today's
    estimate per provider (`aiSpend.v1`). Prices come from OpenRouter's public catalog; a
    model it does not list shows no cost rather than a guess.
  - **Answer order**: every provider with a key, free and paid, with ↑↓ (`aiOrder.v1`); the
    next takes over when one fails or runs out. Optional **rotation**: each new conversation
    starts with the next provider (`aiRotate.v1`).
- **Copy a preset** (*Copy…*): any stored preset, user or factory, over a user slot, without
  loading either; read back and checked. Unsaved edits do not go with it.
- **Tuner** button: turns the pedal's tuner on and off (CC 58). The pedal does not report it,
  so the button shows what the editor last sent.
- **Back up all presets** (Backups panel): the 50 user presets, read without loading any of
  them, into a file downloaded at once. **Restore all** writes such a file back: first a backup
  of the slots as they are now (so it can be undone), then every slot, each checked, then back
  to the loaded preset. Single slots can still be restored one by one.
- `apps/mcp/scripts/try-copy-tuner.ts`, the supervised script that first tried copy and the
  tuner on the owner's pedal.

### Changed

- Backups (before a restore, and the all-slots backup) read each slot straight from the
  pedal's memory (`12 4F`, confirmed on the owner's unit) instead of loading it: the loaded
  preset and its unsaved edits are never touched.
- Tone assistant: only a message's first request carries the model list, so a tone spends
  about 40% fewer tokens and Groq's free 200,000 tokens a day last longer.
- `docs/hardware-tests-1.0.md` follows the editor as it is.
- Tests: placeholder AI keys no longer look like real ones, so secret scanning does not flag
  them.

### Fixed

- Tone assistant: kept tones reach the model with their main gear, and one is reused only
  when it matches the request's instrument, part and reference (a guitar request had loaded
  a kept bass tone named "Pantera B").
- Over Bluetooth, the toolbar shows "Bluetooth · Pocket Master" instead of the USB MIDI
  input and output pickers.
- Backups → *Import file*: a preset file picked there by mistake opens as a preset import
  (load it, then save to any slot) instead of a refusal shown out of sight at the top of the
  page.
- A pedal script log committed by mistake is out of the repository, and `.gitignore` keeps
  such logs and copy backups out.

## [0.14.0] - 2026-11-22

**Describe a tone, get it on the pedal.** The new tone assistant turns "Black Album rhythm
tone" or "warmer, less gain" into models and knob settings, live, and lists what changed. It
runs on your own free AI key, Groq (about 1,000 requests a day) or Google Gemini, called
straight from the editor and the desktop app, with no server of ours; saving still goes
through the Save dialog you confirm. Also new: a preset library, and
the pedal's firmware version in Global options.

![The tone assistant building a Black Album rhythm tone](https://raw.githubusercontent.com/fgbona/OpenSonicX/main/docs/media/assistant.jpg)

### Added

- **Tone assistant** in the editor and the desktop app: describe a sound ("Black Album rhythm
  tone", "warmer, less gain", in English or Portuguese) and it is built on the pedal, live.
  - It runs on the person's own free key, called straight from the editor, with no server of
    ours: **Groq** (about 1,000 free requests a day on `openai/gpt-oss-120b`, no card;
    recommended first) and/or **Google Gemini** (Flash and Flash-Lite, stateless, so Google
    keeps no conversation).
  - Guided key setup per provider, with a link to its console; each key is tested before it
    is kept, stays on the device, and is never shown in full.
  - With more than one key the editor routes on its own: Groq, then Gemini Flash, then Gemini
    Flash-Lite. A model whose free requests run out passes the message to the next and stays
    paused until it comes back; one that runs out after it already changed the sound stops
    instead, so nothing is done twice. Each answer says which model gave it.
  - A meter of each model's free requests (Groq's real remaining count when the browser can
    read it) and when they reset.
  - Each answer lists what changed on the pedal. The editor's Undo and Revert work on the
    assistant's changes; saving opens the Save dialog filled in, and only the person's click
    saves; loading another preset asks first if there are unsaved changes. With Live edit
    off, it asks to turn it on instead of changing anything.
  - When a tone sounds right, the assistant keeps it in the preset library with the reference
    it matches ("BLACK RHY — Metallica Black Album, rhythm"); asking for it again loads the
    kept tone exactly, without spending extra requests.
  - Three example requests under the empty chat; a click puts one in the message box.
  - Clear messages when a key is refused, when every free quota is used up (and until when),
    and when Google does not offer Gemini in the person's region (with Google's list).
  - A notice that what is written and the loaded preset go to the provider.
- A preset library: every preset you export, or import into the pedal, is kept in this
  browser (or the desktop app), newest first, up to 50. *Load…* opens the import
  confirmation with what it changes from the loaded preset.
- The editor reads the pedal's firmware version on connecting: *Global options* shows it,
  and a notice appears when it is not V1.3.3, the version the editor was tested on. The MCP
  server's `get_global_settings` names it too (record 01 01 of the settings reply, as
  documented in klotznick's CC0 Pocket Master Interoperability Guide).
- MCP server: `undo_edit` puts the edit buffer back as it was before the last `edit_preset`,
  up to 20 steps. It refuses once the pedal is on another preset, and loading, reverting,
  saving or importing clears it.
- `docs/smart-box-2.0.md`: what is known about the Sonicake Smart Box before 2.0.0 (the
  features and models SonicMaster offers only on it, where their data comes from, a read-only
  first session). The probe script now finds a Smart Box too and
  prints the port it opened.
- Link previews: sharing the site's address (WhatsApp, Discord, social networks) shows the
  editor's picture and a description.
- SECURITY.md (private reports, and every browser storage key the editor uses) and issue forms
  for bugs and ideas.
- README: a "Describe a tone" section with an animation of the assistant at work.
- Groundwork for reading a stored preset without loading it (12 4F, also from the guide): the
  probe script compares it with the edit buffer; the editor keeps loading a slot to back it up
  until that check passes on the pedal.
- Tests: the assistant end to end (simulated pedal and providers) on desktop and phone, in
  Portuguese and for accessibility; `npm run e2e:live` (with `GROQ_API_KEY` and/or
  `GEMINI_API_KEY`) checks the real providers.

### Changed

- Saving no longer backs up the target slot first (owner's request: the extra step loaded
  the slot and slowed every save). The Save dialog has no backup checkbox; it states the
  slot will be overwritten and saves at once. Restoring a backup still backs up the slot
  first, and older backups stay in the Backups panel. The MCP server's `save_preset` is
  unchanged.
- The project is now **OpenSonicX** (github.com/fgbona/OpenSonicX): open-source tools for
  Sonicake pedals, starting with the Pocket Master and next the Smart Box. The site moves to
  https://fgbona.github.io/OpenSonicX/ (the old address stops working; GitHub forwards the old
  repository links). The desktop app, its updates, the npm package and the container image
  keep their names.
- The tone tools (turning "AMP gain 70" into an edit, and the preset and model text an
  assistant reads) moved from the MCP server into the shared core, so the MCP server and the
  editor's assistant run the same code. The MCP server behaves exactly as before.
- The Windows self-update check now closes the "downloaded" box (Later) and then the app,
  the install-on-quit path. 0.13.7 -> 0.13.8 verified this way.

### Fixed

- Tone assistant: an answer cut by a free limit after the sound had changed still opens the
  Save dialog that was asked for, and the message says when the model is free again instead
  of "the free requests ran out" (Groq's free plan often stops for a minute, not a day). A
  Groq per-minute pause of up to 90 seconds is now waited out within the message.
- Tone assistant: when the request asks to save in a slot ("salve no P44", "save it to
  P45") and the model only says it saved, the editor now opens the Save dialog for that slot
  itself, and says nothing is stored until it is confirmed there. Seen with Gemini
  Flash-Lite, which ignored the instruction.
- Saving: right after a save the pedal can still report the slot's old name; the editor
  now asks again a few times (up to about a second) before calling the save wrong. Seen on
  the owner's unit: P38 was saved as "QClean" but first reported "Noise Wall". When the
  name really differs, the message is in the editor's language.
- Tone assistant on Groq's free plan (8,000 tokens a minute): the first message was larger
  than a whole minute's allowance, so Groq refused it. The model list it carries is now one
  short line per model (name, what it is based on, parameters; list_models still gives the
  full text), Groq's answers are capped at 2,500 tokens, and a per-minute limit of up to
  45 seconds is waited out within the message instead of failing it.
- Tone assistant: a long "What changed" list no longer scrolls inside the scrolling
  conversation (two scroll bars); only the conversation scrolls, and it is taller. A new
  answer shows from the question that asked for it, not from its end.
- Tone assistant: asked to save ("save it in 43"), it now always opens the Save dialog once
  the sound is ready, even when a kept tone already matched, and never says a tone is saved
  unless the person saved it. An answer that changed nothing on the pedal now says so.
- Tone assistant: shapes the sound with the amp's own tone controls first and keeps the EQ
  block to small corrections (±12 of its -50..50), and describes changes in the same terms
  as the values. It used to push EQ bands to -30 or +20 while calling it "a slight cut".
- Tone assistant: answers come in the editor's language (Portuguese or English); Groq used
  to drift to English, the language of the preset text it gets.
- Tone assistant: when it changes a block that stays off (a reverb tuned but never turned
  on), it is told the changes are not heard, so it can turn the block on.
- Tone assistant, "What changed": parameter rows name the block's model and say when the
  block is off ("RVB · Plate 2 (off)"), and a new model is followed by the values it now has.
- Tone assistant: a model that gets overloaded after it already changed the sound now says
  the answer was cut in the middle and to send it again, instead of only "overloaded".
- Tone assistant and MCP server: a model change on the NR block (it only has the Gate) is
  refused with a clear reason before anything is sent, instead of an editor error banner.
- Tone assistant: a model request that gets no answer within a minute (Gemini under high
  demand sometimes never answers) is given up; that model is skipped for half a minute and
  the next one answers, instead of "Working on it…" forever.
- Tone assistant: a model under high demand (Gemini's or Groq's 503) no longer stops the
  chat with "Gemini answered 503"; it is skipped for half a minute and the next model with a
  key answers. When every model is busy, the chat says so and when to try again.
- Tone assistant: Groq's 403 is no longer reported as a refused key (a wrong key is a 401);
  the chat shows Groq's own reason, such as a blocked model or network.
- Tone assistant, smaller fixes before release:
  - A Groq quota without a retry time now waits for the reset Groq states, or an hour for
    a daily limit, instead of retrying every minute; a Gemini per-minute quota without one
    pauses a minute instead of until Pacific midnight.
  - A malformed tool call from Groq's model (`tool_use_failed`) is retried once.
  - When the browser will not store a key, the panel says it lasts until the page closes.
  - An interrupted answer is kept in what the next one is told, so the request is not lost.
- Tone assistant routing (review of the Groq change): a model whose free requests run out
  after it already changed the sound no longer hands the message to the next model, which
  would do it again ("more gain" twice); the panel says the answer was cut and to send it
  again. A provider that refuses its key while another answers is reported once instead of
  failing quietly on every message. Each model's pause is kept as the router learns it.
- Tone assistant: `save_preset` also stops when the person loaded another preset during a
  reply, like the other tools that change the pedal.

## [0.13.8] - 2026-11-21

Undo and redo for live edits, a preview of what a preset file changes before loading it,
and two fixes found over Bluetooth: Save suggests the right name, and a saved preset no
longer counts as modified. Toward 1.0: preset files, the MCP tools and browser data are
pinned by tests, and a read-only probe prepares the remaining checks on the pedal.

### Fixed

- Save suggested the wrong name: on first opening it took P01's name ("MTL-CLEAN") instead
  of the loaded slot's, and later it kept the name typed the time before. It now starts from
  the name of the slot it saves to every time it opens.
- After a save the preset still counted as modified (header, Revert, and a "Discard the
  changes?" question when loading another preset), because the pedal's own "modified" flag
  read before the save was kept. A save now clears it.

### Added

- Importing a preset file first shows what it changes from the loaded preset (chain order,
  models, on/off, each parameter and the volume), so a file can be compared with the
  current sound and the import cancelled.
- Undo and Redo for live edits: toolbar buttons next to Revert, and ⌘Z / ⇧⌘Z (Ctrl+Z /
  Ctrl+Shift+Z or Ctrl+Y elsewhere). Turning a knob counts as one step however many values
  it sent; up to 100 steps, cleared when another preset is loaded.
- `apps/mcp/scripts/probe-pedal.ts`: a read-only diagnostic for sessions with the real
  pedal. It checks the USB port is quiet, sends every known read query (optionally every
  unmapped one with `--scan`), flags anything that looks like a firmware version and saves
  the whole exchange to a log file. `docs/hardware-tests-1.0.md` lists the remaining checks
  on the pedal before 1.0.
- Toward 1.0, what others rely on is now pinned by tests that fail on any change:
  - Preset files: format version 1 is frozen for 1.x and documented in
    `docs/preset-file-format.md`. A file written by 0.13 is kept in the tests and must
    keep opening the same way; later 1.x versions may only add optional fields.
  - The MCP server's tools: names, parameters and their types are recorded in
    `apps/mcp/test/fixtures/tool-contract.json`, so a change to what assistants call is
    always deliberate.
  - Browser data: backups and slot comments as 0.13 stored them must still load, and
    survive the next write.
- README: a "What works where" section (tested firmware, browsers, what this firmware does
  not do), and the start screen says which firmware the editor was tested with.
- An end-to-end test of the save safety net: a save backs up the slot first, the backup
  shows in the Backups panel, and restoring it puts the slot back byte for byte.

## [0.13.7] - 2026-11-21

Desktop app on Electron 45.4.1, with its self-update now checked on Windows and
Linux after every release. Closing the update box no longer restarts the app, the
model menu stays on a phone's screen, and the Portuguese UI has no English left.

### Fixed

- Portuguese UI: the busy steps "Reading settings" (Global options), "Loading", "Renaming",
  "Uploading" and "Factory reset" showed in English, as did the error when a factory reset
  could not be sent; the SysEx log's screen-reader label was English too.
- On a phone the model menu now sits at the bottom of the screen. In the dark theme it was
  anchored to the panel it opened from (a blurred glass panel captures fixed elements), so
  it could end below the screen's edge; in both themes it ran 12px past the right edge.
- Desktop app: closing the "update downloaded" box (Esc or its close button) restarted the
  app at once, as if "Restart now" had been picked; it now means "Later". Closing the
  "new version available" box no longer opens the download page either.

### Added

- A CI check that installs the previous release on Windows and Linux, lets it find and
  download the latest one, quits it, and confirms the new version got installed. It runs
  after every release and on demand.
- End-to-end tests on a phone screen (Pixel 7, touch): the page fits without sideways
  scrolling, the preset list stays folded until opened, the chain reorders with the arrows
  and the model menu opens inside the screen in both themes.
- An end-to-end test that opens the editor in a Brazilian browser and walks the main
  screens, the AMP menu, the save dialog and Global options, failing on any text left in
  English (the pedal's own names and the SysEx log's protocol notes excepted).

### Security

- The desktop app runs on Electron 45.4.1 (was 45.2.3), which carries the latest Chromium
  security fixes.
- The installer build no longer pulls a minimatch version open to a denial of service
  (GHSA-g3hv-75wg-m249): versions 7 to 11.0.0 are overridden to 11.0.9. This only ran on
  the build machine; nothing shipped to users used it. `npm audit` is clean again.

### Changed

- The MCP server's native MIDI library is updated to @julusian/midi 3.9.0.
- The desktop packaging check also runs when the lockfile changes, so a dependency bump
  that breaks an installer shows on its pull request.

## [0.13.6] - 2026-11-21

Easier to read in both themes, no jump on phones while the page loads, and
the README shows the editor. Tested end to end against a simulated pedal.

### Removed

- `apps/web/AGENTS.md` (written by `next dev` for AI coding assistants;
  `agentRules: false` now turns it off) and the assistant-only header of the
  plans in `docs/superpowers/plans`.

### Added

- End-to-end tests: Playwright drives the editor in Chrome against a
  simulated pedal speaking SysEx (connect, read, read-only until live edit,
  knob and model edits, revert, the unsaved-changes guard, save with backup,
  slot comments in the AMP menu). They run in CI on every pull request.
- Accessibility tests: axe (WCAG 2.1 A/AA) on the editor before and after
  connecting, in both themes, and a pixel-based contrast check for text over
  gradients, including every amp finish.

### Changed

- Easier to read (WCAG AA contrast, now checked in CI): the light theme uses
  Apple's Increase Contrast colours; off blocks keep their names readable
  (the dim icon and unlit LED still say they are off); block names, the
  primary button and the indigo EQ are a little brighter on the dark theme;
  the Rectifier and British-vintage signatures are darker on their light
  plates.
- On a phone the page no longer jumps as it loads (Lighthouse layout shift
  0.117 -> under 0.05, now tested): the Bluetooth button is there from the
  start instead of appearing after the page starts, and toolbar buttons keep
  their label on one line.

- The README shows the editor: screenshots of the chain, eight amp
  finishes and the model menu, the tube warming up, and a download table
  for the desktop app. `scripts/readme-media.mjs` regenerates them from the
  preview page.
- The README's "Run it" section is gone: development setup was already in
  CONTRIBUTING.md, which now also covers hosting the container.

## [0.13.5] - 2026-11-20

Clearer drive labels and a faster CI.

### Changed

- Clearer drive labels: Butter OD reads "Boss OD-1 style" and JP Dist
  "Boss DS-1 style" (the manual only describes them as the classic yellow
  2-knob overdrive and orange 3-knob distortion), and Shark "Crunch Box
  (amp in a box)".
- CI runs in about a third of the time: the converter parity tests against
  SonicMaster's output (several minutes) run in their own workflow, only when
  the converter or its fixtures change.

## [0.13.4] - 2026-11-20

The redesign: a dark stage theme, an amp faceplate that dresses like each
model's gear, model menus with aligned columns, and comments on captures
and IRs.

### Added

- Comments on captured-profile and user IR slots: write one from the Pedal
  slots panel and it shows next to the name in the AMP and IR menus, in the
  same second column as the built-in models' descriptions (without one, the
  column says which slot it is). Installing from TONE3000 fills it with the
  tone's title and creator. The pedal stores only a slot's name, so comments
  live in this browser or desktop app, tied to the slot and the name it held.

### Changed

- New look, a dark "stage" theme, now the default (the light theme stays a
  click away): graphite glass panels, an amber accent that glows, a lit
  signal cable running through the chain of pedals, chrome knobs, and the
  AMP block drawn as an amplifier faceplate with screws, a top vent, a lit
  power tube (an illustration the owner generated for this project), the
  speaker grille and a script "Based on …" signature. The other blocks get a
  dark face in their own colour. The tube follows the AMP block: dark when
  it is off, warming up over about a second and a half when it is turned
  on or a new amp model loads, glowing hotter with more gain, and
  breathing gently while lit (no motion if the system asks for less).
- The AMP faceplate dresses like the gear each model is based on, without
  logos: tweed, blackface, British fawn and copper, a brushed-gold Marshall
  panel, Rectifier diamond plate, hot-rod chrome, 90s black and red, modern
  German graphite with a blue light, boutique walnut, solid-state silver
  (no tube on the Jazz 120) and bass black and silver.
- Model menus are drawn by the editor instead of the system: two aligned
  columns, the pedal's name and what it is, under the style groups, in the
  theme's colours, with the same keyboard use as a menu (arrows, Enter,
  Escape, first letter).
- Everything but the tube image is CSS and SVG; the tube and the script
  font ship with the app, so it works offline.

## [0.13.3] - 2026-11-20

Plain-language model names, and the first update the macOS app installs by
itself (from 0.13.2).

### Changed

- Model menus speak plainly: every model keeps the pedal's own name (what
  its screen shows) followed by what it is, such as "Brit 800 — Marshall
  JCM800" or "Plate 1 — Large plate", and long menus are grouped by style
  (amps: clean, crunch, high gain, bass; cabinets by speaker count;
  modulation, tremolo, pitch; digital or analog and tape delays; rooms,
  plates and springs, ambient reverbs). Descriptions follow the chosen
  language; all 110 models have one in Portuguese.
- The preset volume knob is labelled Patch Volume (Volume do patch).
- The SysEx log is hidden unless you turn it on from the link under the
  panels; the choice is remembered. It is a troubleshooting tool, not
  something an editing session needs.
- CI and release workflows use actions/checkout v7.0.1 and actions/setup-node
  v7.1.0 (pinned by SHA), which run on Node 24: GitHub warned that the v4
  actions target the deprecated Node 20 runtime.

## [0.13.2] - 2026-11-20

The macOS desktop app updates itself from this version on (install this one
by hand once), and the editor is on GitHub Pages.

### Added

- The editor is published to GitHub Pages with every release (and on
  demand), at https://fgbona.github.io/sonicake-pocket-master-editor/, or at
  the root of a custom domain set in the PAGES_DOMAIN variable. `NEXT_BASE_PATH`
  builds it under a path prefix; the NAM conversion worker follows that
  prefix, which until now was assumed to be the site root.
- The macOS desktop app updates itself: it downloads the new release's zip,
  checks it against the SHA-512 in latest-mac.yml, and swaps its .app bundle
  when it quits (or right away, if you choose to restart), keeping the old
  one if the copy fails. Squirrel.Mac cannot do this for an app without an
  Apple Developer signature. It still only announces the release when it
  runs from the disk image, from a translocated copy or from a folder you
  cannot write to. Updated apps carry no quarantine flag, so Open Anyway is
  needed only after the first download.

### Fixed

- Releases are full releases, no longer pre-releases: the desktop apps'
  updater reads releases/latest, which skips pre-releases, so a 0.13.0 app
  could not find any update. v0.13.0 was switched over by hand, which lets
  the apps already installed find the next version.
- The macOS app is named Pocket Master Editor again; 0.13.0 and 0.13.1
  installed it as pocket-master-editor.app (a Linux file-name setting leaked
  into the macOS build). Updates keep the installed bundle's name.

## [0.13.1] - 2026-11-20

First update for the desktop app: installed 0.13.0 apps pick it up (Windows
and Linux install it on restart; macOS shows where to download it).

### Changed

- In the desktop app the start screen no longer asks to enable MIDI or
  lists browsers: it says to check the ports and connect, and that
  Bluetooth finds the pedal by itself.

## [0.13.0] - 2026-11-20

The editor as a desktop app: installers for Linux, Windows and macOS are
attached to this release, and installed apps update from the next one.

### Added

- Desktop app for Linux (AppImage), Windows (installer) and macOS (dmg, Apple
  Silicon and Intel), attached to each release. It serves the editor's static
  export from inside the app, so it works offline; USB MIDI and Bluetooth work
  as in Chrome (the app picks the pedal in the Bluetooth chooser). Windows and
  Linux update themselves from the GitHub release; the macOS build is not
  notarized, so it announces new versions and opens their page instead.
- `NEXT_OUTPUT=export` builds the web editor as static files.

### Fixed

- Record 05 02 is the boot anti-touch protection (the pedal's menu name),
  not a power-off confirm: the owner changed it on the unit while the
  editor watched the settings reply. The setting is now `bootProtection`
  in the core and the MCP, labelled as on the pedal (#62).

## [0.12.3] - 2026-11-20

Global options now match the Pocket Master: settings that belong to the
Smart Box (SonicMaster serves both pedals) are gone, and the settings
reply is read by record address, so power-off confirm shows its real
value.

### Removed

- The EXP/FS section (jack type and targets), ECO and battery-only, from
  Global options and the MCP's global settings tools. These are Smart Box
  settings (SonicMaster serves both pedals): the Pocket Master has no
  EXP/FS jack and no ECO menu (checked on the owner's unit), and firmware
  V1.3.3 reports none of them. Global options now holds master volume,
  the four levels, backlight and power-off confirm.
- USB recording mode (dry/wet) and re-amp, from Global options and the
  MCP's global settings tools. On firmware V1.3.3 the pedal ignores mode
  writes (it keeps reporting wet) and has no re-amp record; a tone played
  into it over USB came back as digital silence in every combination.

### Fixed

- Global settings are read by record address. The reply is a list of
  `<address> <length> <value>` records, but the decoder (ported from
  SonicMaster) read fixed byte positions; on firmware V1.3.3, which sends
  fewer records, it showed the power-off confirm as "re-amp on". Re-amp,
  ECO and the EXP/FS jack type are absent from that firmware's reply and
  now show as not reported; power-off confirm is read for the first time.

## [0.12.2] - 2026-11-20

Fixes from the first hardware pass on a unit with firmware V1.3.3: two
controls ported from SonicMaster do not exist on this firmware. Sync and
Trail silently ruined Mix or Depth and are removed; the per-block
footswitch did nothing and is removed.

### Removed

- The per-block footswitch (None / FS1 / FS2 in the block editor, the FS
  badge on the tiles and the MCP's `footswitch` change). Checked on a
  unit with firmware V1.3.3, also with the jack set to Dual FS: the pedal
  ignores the assignment command (11 4D) and its dump never shows one. On
  this firmware a footswitch toggles a block through the device-wide
  EXP/FS function (Global options, `set_global_settings` fs1Target and
  fs2Target), which stays. The live-edit guard now refuses 11 4D.

### Fixed

- Sync (modulation and delay) and Trail (delay) are gone from the model
  catalog, and with them tempo sync's note divisions. Firmware V1.3.3 has
  neither: checked on a unit, writing either slot changed the model's
  first parameter instead (delay Mix 12 -> 1, chorus Depth 38 -> 1), so
  turning Sync or Trail on in the editor or through the MCP silently
  ruined Mix or Depth. They came from SonicMaster's catalog, which may
  target newer firmware.

## [0.12.1] - 2026-11-19

Ships the 0.12.0 container image, which never finished building (see
Fixed), with the fixes from the review of 0.12.0. No new pedal writes; the
MCP gains the one-at-a-time queries.

### Security

- GitHub Actions are pinned to full commit SHAs (version kept in a
  comment for Dependabot), so a moved tag cannot change what CI and the
  release run.

### Fixed

- Installing a NAM capture no longer freezes the page for about a second
  before the conversion: the reference DI's 44.1 -> 48 kHz resample runs
  in a worker like the probe passes and the fit.
- The container image build no longer runs the test suite: it already
  runs natively in CI and in the release's verify job, and under QEMU the
  arm64 build spent hours on the NAM converter's golden test (175 s on
  amd64), so the 0.12.0 image never finished publishing.
- Queries to the pedal go out one at a time. On connect the presets
  sidebar read the 21-packet name list while the preset was being read;
  replies are matched by kind and joined by packet count, so two in flight
  could mix or time out (most visible over Bluetooth).
- Factory reset no longer re-reads a pedal that is rebooting: it is sent,
  then the editor disconnects, instead of ~10 s locked on retries ending
  in a "did not answer" error.
- EXP/FS target writes queue like settings: only the latest value per
  slot goes out.
- The development preview no longer re-reads the settings in a loop.
- A TONE3000 sign-in stops asking for the code's approval when its panel
  closes (for example, the pedal disconnects), instead of polling the
  token endpoint until the code expires up to ten minutes later.

## [0.12.0] - 2026-11-19

The editor reaches SonicMaster's depth in this editor's design: pedal
tiles, a knob block editor, a presets sidebar, Global options, a phone
layout and Bluetooth. Released before every hardware write was checked on
a unit, at the owner's call: reading, preset volume, global settings
(backlight), Bluetooth connect, preset names over Bluetooth and a TONE3000
capture upload over Bluetooth were checked; footswitches, tempo sync,
slot renames, EXP/FS targets and the other global writes were not yet.
npm: `npx -y sonicake-pocket-master-mcp` (now with the TONE3000 app key).
Container image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.12.0`.

### Fixed

- Over Bluetooth the preset names never loaded: the 21-packet reply takes
  about 2 s (~90 ms a packet), longer than the 1.5 s request timeout and
  the reassembler's 1 s window, so each try was dropped just before its
  last packet and re-sent. The window now counts from the last packet, and
  every packet still arriving restarts the request's timeout. The presets
  sidebar's "Read names" button no longer stretches over the column.
- BPM is no longer shown or offered as a control. The pedal (V1.3.3)
  ignores SonicMaster's `11 42 02 20 …` tempo write and five variants of
  it (lengths 1/2/4, u8, u32, float32) while a volume write on the same
  path works, and the unit shows no value for the 0x2002 record it was
  read from. Removed: the BPM knob, tap tempo, the delay's "Time from
  BPM" buttons, the MCP `bpm` change and the BPM in `get_preset`.
- Backlight in Global options runs 0..100, as the unit reports it; it was
  capped at 10 (taken from SonicMaster), so moving the slider set a full
  backlight down to 10.

### Added

- The npm package of the MCP carries the editor's TONE3000 publishable
  key (written in at release from the repository variable), so users only
  sign in with their own TONE3000 account, as in the web editor; a key in
  `TONE3000_CLIENT_ID` or `tone3000.env` still overrides it.
- Bluetooth: "Connect via Bluetooth" links the editor to the pedal over
  BLE MIDI (Web Bluetooth: Chrome and Edge, Android included), with no USB
  cable or MIDI permission. Frames go out whole after the `80 80` header,
  one write at a time; incoming notifications are reassembled into SysEx
  (any byte with the top bit set other than F0/F7 is BLE framing, since
  every data byte here is a nibble). A pedal that drops off is reported.
- Phone layout: the presets list folds behind a button showing the
  current preset, the main column no longer widens the page past the
  screen (the chain strip scrolls inside it), smaller pedal tiles, and on
  touch screens the chain's move arrows stay visible, since touch has no
  hover and no HTML drag and drop.
- MCP `get_global_settings` and `set_global_settings`: the device-wide
  options in words, and changes by value or target name (validated before
  anything is sent; the jack type is written before its targets). Factory
  reset is deliberately not exposed to the assistant.
- Global options (gear in the toolbar): master volume and the input,
  FX-rec, monitor and BT-rec levels as knobs, USB recording dry/wet and
  re-amp, the EXP/FS jack type and its targets, backlight, ECO, power-off
  confirm, battery-only, and a factory reset that asks for RESET typed
  out. The core reads the 12 10 dump (`readGlobals`) and builds the writes
  (`setGlobal`, `setExpFsTarget`, `factoryReset`), ported from SonicMaster
  and checked byte for byte against the official app's captured frames;
  they go through the edit queue, and the reset has its own link method.
- Editor layout closer to SonicMaster, in this editor's design: a presets
  sidebar with Factory/User banks and search; the chain as pedal tiles
  with an original drawing per block, an on/off LED and the footswitch
  badge; one block editor with rotary knobs (drag, wheel, arrows,
  double-click to default), the model list, "Based on" text, an FS
  None/FS1/FS2 control and delay Time from the BPM; preset volume and BPM
  as knobs with tap tempo. A development-only `/preview` page renders it
  from a stored dump without a pedal.
- Preset BPM (40–260) and footswitches. The core reads the BPM (dump
  record 0x2002) and which blocks FS1 and FS2 toggle, and can change both
  as live edits: `11 42 02 …` for the tempo, `11 4D <switch> <module>
  <on>` per footswitch membership, at most three blocks per switch.
  Revert, restore and preset files carry them, and a block moving between
  switches is added to the new one before it leaves the old.
- The MCP's `edit_preset` takes `bpm` and `footswitch` changes, and
  `get_preset` shows the tempo and each block's switch.
- Sync (modulation and delay) and Trail (delay) switches in the catalog.
- User IR upload. The core turns a WAV (PCM 8/16/24/32-bit or float, any
  channels and rate) into the pedal's 512 taps at 44.1 kHz and sends it in
  acknowledged 19-byte chunks on a new guarded upload path, after opening
  the edit session (12 30); it only reports success once the pedal
  announces the flash write (12 1B 04), and checks the slot's new name.
  The MCP's `load_ir` writes a WAV from `~/.pocket-master-editor/irs`
  into user IR 1..5, needs `confirm` ("IR3") and refuses to overwrite a
  loaded IR without `replace`, because the pedal cannot send it back.
  Clearing a slot is left out: it leaves the pedal refusing IR writes
  until a power cycle.
- NAM capture to captured-profile conversion in TypeScript: .nam parsing
  (classic WaveNet, v0.7.0 schema, TONE3000 SlimmableContainer), WaveNet
  inference, the multi-level Wiener-Hammerstein fit of the pedal's clone
  engine, the .clo format, and the profile upload (11 25, flash-write
  notice 12 1B 03). Bit-identical to SonicMaster's own DSP on its test
  capture, with both a synthetic and the real reference DI. The reference
  DI is downloaded at use and checked by SHA-256; it is not distributed.
- Slot names are read from the full 16-byte record, so captured-profile
  names up to 15 characters are no longer cut at 10.
- TONE3000 in the MCP: `tone3000_login` (device sign-in, token kept
  owner-only in `~/.pocket-master-editor`), `search_tone3000`,
  `install_tone` (NAM capture -> converted -> profile slot, or IR -> user
  IR slot; `confirm` and `replace` as for other slot writes) and
  `load_nam` for local captures. Conversions run the five probe passes in
  parallel worker threads. Core has a TONE3000 client (PKCE for the
  browser, device authorization, search, models, download).
- Web editor, closer to SonicMaster's features in our design: a preset
  list with filter and an unsaved-changes guard, BPM with tap tempo, a
  footswitch selector per block, a pedal-slots panel (load a .nam into a
  profile slot, converted in web workers, or a WAV into a user IR slot),
  and a TONE3000 panel (device sign-in, search, install a capture or IR).
  The conversion worker is bundled with esbuild into
  `public/convert-worker.js`, as Turbopack ships `new Worker(new URL(…))`
  sources unbundled.
- Protocol knowledge ported from SonicMaster (MIT, credited in NOTICE).
  Reading the BPM is confirmed on the owner's unit; the new writes are
  tested on the simulated pedal and still need a test on the unit.

## [0.11.0] - 2026-11-19

The MCP server on npm: `npx -y sonicake-pocket-master-mcp`, published by CI
with provenance. Container image:
`ghcr.io/fgbona/sonicake-pocket-master-editor:v0.11.0` (amd64 and arm64; the image
serves the web editor).

### Added

- The MCP server is an npm package, `sonicake-pocket-master-mcp`: one
  bundled file with the core inside, installable with
  `npx -y sonicake-pocket-master-mcp`. CI packs it, installs the tarball
  into an empty folder and starts it on every push; the release workflow
  publishes it to npm with provenance (trusted publishing, no stored
  token) once enabled.

### Changed

- The native MIDI library loads on the first call to the pedal, so the
  server starts and lists its tools even where MIDI is unavailable.
- The MCP server reports the version from its package.json.
- The package always publishes to the official npm registry (publishConfig), whatever registry the local npm is set to.

## [0.10.0] - 2026-11-19

Tool timings and a library of approved tones for the MCP server. Container
image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.10.0` (amd64 and arm64; the
image serves the web editor).

### Added

- A library of approved tones: `export_preset` takes notes (e.g. "Metallica
  - Black Album rhythm, approved by ear") and `list_preset_files` lists the
  saved tones with them. The assistant checks the library before building
  a tone from a reference and loads a match instead of rebuilding it.
  Preset files with notes still open in the web editor.
- Every MCP tool call is timed and logged to
  `~/.pocket-master-editor/timings.log`, to tell the pedal's time from the
  assistant's.
- The server asks the assistant to keep calls few (edits and saves already
  return the preset). The README suggests `claude --effort low` for faster
  tone sessions.

## [0.9.0] - 2026-11-19

The MCP server builds tones from a reference. Validated by the owner on a
V1.3.3 unit through Claude Code: "Black Album" saved to P50 and an Iron
Maiden "Stranger in a Strange Land" tone saved to P49, then refined and
saved again, each save backing up the slot it replaced. Container image:
`ghcr.io/fgbona/sonicake-pocket-master-editor:v0.9.0` (amd64 and arm64; the image
serves the web editor).

### Added

- The MCP server knows what every model is: `list_models` (now also
  without a block, for the whole pedal) gives the real gear each model is
  based on, from the Pocket Master manual, a short description and its
  parameters with ranges. Models can also be named by that gear ("Dual
  Rectifier Modern", "JCM800", "Tube Screamer"). Models added after the
  manual's firmware say so instead of guessing.
- The server tells the assistant how to build a tone from a reference (an
  artist or record): work out the gear, map it to the pedal's models and
  build the whole chain in one edit, without asking for details.

## [0.8.0] - 2026-11-19

MCP server (preview): an AI assistant can read and edit the pedal's presets
in conversation. Container image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.8.0`
(amd64 and arm64; the image serves the web editor).

### Added

- MCP server (`apps/mcp`, preview): an AI assistant can read the loaded
  preset, list presets and models, edit by name (parameters, block on/off,
  models including user IRs and captured profiles, chain order, volume),
  load and revert presets, export and import preset files, and save to a
  user slot with a confirmation and a backup file, which `restore_backup`
  undoes. Reading, live edits and revert verified on a V1.3.3 unit over
  USB; save, restore and preset files are tested against the simulated
  pedal.
- Core resolves blocks, parameters, models and preset labels by name, never
  guessing: unknown or ambiguous names fail with the valid choices.

### Changed

- The guarded link to the pedal, the pedal adapter and the model labels
  moved from the web app to core, behind a two-function MIDI port, so the
  web editor and the MCP server run the same tested code.

### Fixed

- Save and restore now wait for the backup to be stored before the slot is
  overwritten, and stop when it cannot be stored. Before, the web editor
  started the save while the backup was still being kept.

## [0.7.0] - 2026-11-18

Captured profiles (clone mode) on AMP, validated on a Pocket Master with
firmware V1.3.3 and a NAM capture. Container image:
`ghcr.io/fgbona/sonicake-pocket-master-editor:v0.7.0` (amd64 and arm64).

### Added

- Captured profiles (clone mode) on AMP. The AMP model list groups amp
  models and the occupied captured-profile slots by name (for example
  "Randall SA (profile 1)"); choosing a profile switches amp mode on,
  choosing an amp switches it off. Like the unit's own controls, choosing a
  profile turns IR off and leaving clone mode turns IR back on (the unit
  does this only for changes made on it, not over MIDI, so the editor sends
  it); switching between amp models leaves IR alone. In clone mode the chain and the AMP card show
  the profile name. Clone decoding is now verified on hardware with the
  owner's NAM capture.

### Changed

- Revert reloads the preset from its slot, like switching presets on the
  unit, so the edit buffer goes back to exactly what is saved, even if it
  was edited before the editor connected. The editor also reads and follows
  the pedal's own "modified" flag (12 45), so Revert is available whenever
  the pedal says the edit buffer differs from the slot.

### Fixed

- The toolbar's frosted-glass blur never applied in Chrome: the CSS
  optimiser kept only `-webkit-backdrop-filter` of the pair. The prefixed
  declaration now comes first, so the standard one survives and text
  scrolling under the toolbar is blurred instead of showing through.

## [0.6.0] - 2026-11-18

User IR slots show the names of the loaded IR files, validated on a Pocket
Master with firmware V1.3.3. Container image:
`ghcr.io/fgbona/sonicake-pocket-master-editor:v0.6.0` (amd64 and arm64).

### Added

- User IR slots show the names of the IR files loaded on the pedal (for
  example "Marshal 80 (User IR 1)") in the chain, the IR card and its
  model list; an empty slot keeps its generic name. Read once on connect
  (query 12 20); `decodeSlotNames` also reads captured-profile slots
  (12 24), tested on the owner's real replies.

## [0.5.0] - 2026-11-18

Export and import presets as files, validated on a Pocket Master with
firmware V1.3.3. Container image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.5.0`
(amd64 and arm64).

### Added

- Export and import presets. Export re-reads the edit buffer from the pedal
  and downloads it as a `pocket-master-preset` JSON file with the raw dump,
  so settings the editor does not decode yet are kept. Import asks first,
  loads the file into the edit buffer with live-edit commands and checks it
  on the pedal; nothing is saved to a slot, and Revert brings back the
  preset you had. Foreign, damaged or unknown-model files are refused.

## [0.4.0] - 2026-11-18

Portuguese interface, the screen follows the pedal, a theme button and a
half-size container image. Validated on a Pocket Master with firmware V1.3.3.
Container image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.4.0` (amd64 and arm64).

### Added

- The screen follows the pedal: knobs turned and blocks switched on the
  unit show up at once; a model or amp-mode change on the unit is re-read.
- Light/dark theme button in the toolbar. Without a choice the page
  follows the system; the choice is remembered in this browser and applied
  before the page paints.
- Portuguese (Brazil) interface. The language follows the browser (any pt
  locale gets Portuguese, everything else English), a PT/EN switch in the
  toolbar changes it, and the choice is remembered in this browser. The
  editor's own error and progress messages are translated; protocol
  details from the core (SysEx log labels, decoder errors) stay in
  English.
- App icon (favicon).

### Changed

- Container runtime is Alpine 3.23 with only Alpine's nodejs package (Node
  24, no npm, no yarn, apk removed), replacing distroless; sharp is dropped
  since image optimisation is off. Image layers go from 189 MB to about
  95 MB.
- Save… stays disabled until a preset was read from the pedal.
- The SysEx log and the chain view are memoised, so each incoming packet
  renders one log line instead of the whole page (selections during a
  backup were taking up to a second).

### Fixed

- The pedal acknowledges every edit too (14 08 00, seen on hardware); the
  link consumes those acknowledges and a selection or save waits for them,
  so a late edit acknowledge can never answer a preset operation.
- A packet whose index is outside its set no longer crashes reassembly.
- Short dump records are reported in words ("record 0x3003 is too short");
  the optional volume record may still be absent.
- A MIDI port that fails to send (cable pulled) rejects with a readable
  error and leaves no timer or listener behind, on all three send paths.

## [0.3.0] - 2026-11-18

Save to a preset slot, validated on a Pocket Master with firmware V1.3.3:
save with and without the target backup, and restore from a backup.
Container image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.3.0` (amd64 and arm64).

### Added

- Save to a preset slot (phase 3). Save… opens a sheet with the target
  slot (P01..P50, with current names), the name (1..10 ASCII characters)
  and what will be overwritten. Before writing, the editor backs up the
  target slot (about 1 second) and puts your unsaved edits back on the
  loaded preset; then it saves, requires the pedal's acknowledge and
  checks the name and content of the slot. A "Don't back up before
  saving" checkbox skips the backup for one save; it is off every time
  the sheet opens. Backups are kept in the browser (last 20) and offered
  as JSON downloads when the save ends, also when it fails. A warning
  appears if the browser cannot keep them.
- A save is refused when the pedal's preset no longer matches the screen
  (knob turned on the unit) or uses a model the editor does not know.
- Backups panel: download any backup, import a backup file, and restore a
  slot from a backup (what the slot holds is backed up first). Settings
  the editor does not decode yet, such as the probable tempo, are not
  restored; the file keeps the raw dump. A restore always backs up the
  slot it overwrites.
- `packages/core`: selectPreset, savePreset, setPresetVolume,
  isPresetOperation, decodePresetNames, decodeAck, the Pedal interface
  and the saveToSlot and restoreFromBackup flows (plus backupAllSlots,
  not used by the editor yet), tested
  against a simulated pedal that applies real commands to real dumps.
- Web link: a third guarded send path for preset selections and
  user-slot saves. Every operation waits for its own acknowledge (the
  pedal acknowledges selections too, seen on hardware), so a late
  selection acknowledge can never be taken for the save's; nothing is
  re-sent.

### Changed

- Preset volume is a live edit and part of Revert.

## [0.2.0] - 2026-11-18

Live edit, validated on a Pocket Master with firmware V1.3.3: parameters,
block on/off, model changes, chain order, Revert (including knob turns made
on the unit) and preset changes from the footswitch.
Container image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.2.0` (amd64 and arm64).

### Added

- Live edit (phase 2). A Live edit switch, off by default, turns the
  editor into a live controller of the pedal's edit buffer:
  - parameter sliders, switches and option lists, and block on/off;
  - model selection per block (AMP lists amp models; captured profiles
    are shown but not selectable);
  - chain reordering by drag and drop or arrow buttons, with
    DRV-AMP-IR-EQ moving as one group.
  Nothing is saved to a preset slot.
- Restore point and Revert: the first read of a preset is kept. Revert
  re-reads the pedal, so knob turns made on the unit are undone too, then
  sends only the edits needed to return to it (chain, then models, then
  on/off, then parameters).
- A preset switched on the pedal during live edit is detected from its
  notification and re-read, so edits never land on a preset the screen
  does not show.
- `packages/core`: command builders for chain, model, parameter, block
  on/off and amp mode, checked byte for byte against ~7400 captured
  commands; `isAllowedEdit` guard; `encodeValue`; `applyEdit`,
  `editToCommands`, `diffPresets`; `chainUnits` and `moveInChain`.
- Web link edit path: only live-edit commands pass, messages are spaced
  20 ms apart and a slider drag sends only its latest value.

### Changed

- GitHub Actions bumped: upload-artifact v7, download-artifact v8,
  login-action v4, build-push-action v7, setup-qemu-action v4 (the
  Dependabot updates, applied together and exercised by this release).
- After a model or chain change the editor re-reads the edit buffer, so
  the screen shows the defaults the pedal applied. A dump requested before
  the latest edit is discarded and read again, so sliders never jump back.
- A model code the catalog does not know is still applied and shown as
  hex instead of crashing the page.

## [0.1.1] - 2026-11-18

Hardened container and a release pipeline that tests what it publishes.
Container image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.1.1` (amd64 and arm64).

### Added

- CI smoke test: every push and pull request builds the container image,
  starts it and checks with `scripts/smoke-test.sh` that the editor page,
  its static assets and the non-root user are in place.
- Release pipeline split into verify, publish, smoke and release jobs. The
  published image is pulled back and smoke-tested before `latest` moves and
  the GitHub release is created.

- CI lints the Dockerfile with hadolint, validates compose.yaml and scans
  the image with Trivy (fails on HIGH or CRITICAL issues that have a fix).
  The release pipeline scans the published image too.
- Dependabot for base-image digests, GitHub Actions and npm packages.

### Changed

- Container images are published for `linux/amd64` and `linux/arm64`, so
  the image runs on Apple Silicon and ARM servers.
- Hardened container image: base images pinned by digest, distroless
  Node 24 runtime (no shell, no package manager), root-owned read-only app
  files, unprivileged user 65532, Node-based health check, dependency
  install with `--ignore-scripts`, narrower build context.
- Hardened compose.yaml: read-only root filesystem with a small `/tmp`
  tmpfs, all capabilities dropped, `no-new-privileges`, init process,
  port bound to localhost, pid, memory and CPU limits, rotated logs.
- The smoke test runs the image with the same restrictions as compose.yaml
  and also checks the health check and a clean stop on SIGTERM.

## [0.1.0] - 2026-11-18

Read-only preview, validated on a Pocket Master with firmware V1.3.3.
Container image: `ghcr.io/fgbona/sonicake-pocket-master-editor:v0.1.0`.

### Added

- `packages/core`: Pocket Master SysEx protocol in TypeScript with no browser
  or MIDI dependency.
  - Framing: CRC-8/SMBus, nibble expansion, frame build and parse.
  - Multi-packet reassembly that never returns a partial reply.
  - Read-only guard (`isReadOnly`) that accepts only GET (`0x12`) queries.
  - Edit-buffer decoder: chain order, block on/off, model, parameters with
    kind, range and display text. Unknown effect codes render as hex.
  - Model catalog (9 blocks, 110 models), preset labels (P01..P50, F01..F50),
    and log labels for every SysEx message.
  - Tests on `node:test` against real captures: preset P08 from a V1.3.3 unit
    and the reference P34 dump.
- `apps/web`: read-only Next.js editor.
  - Lists MIDI ports and auto-selects the Pocket Master. Never preselects
    another device.
  - Reads the current preset and edit buffer and shows the signal chain and
    every parameter.
  - Logs every SysEx message sent and received, in hex, with time and label.
    Copy and Clear buttons.
  - Apple system fonts and system colors, light and dark mode.
  - Enables MIDI on load when the visitor already granted access.
  - Link tests: retry after a timeout, readable error after three tries,
    cancel on close, notifications not mistaken for replies.
- Container image: Next.js standalone server, multi-stage build that runs the
  tests, non-root user, health check. `compose.yaml` for local use.
- MIT license, NOTICE with third-party attribution, README, CONTRIBUTING, CI.
- Release workflow: a `v*.*.*` tag publishes the container image to GHCR and a
  GitHub release with this changelog's notes.

### Fixed

- Disconnecting during a read no longer sends more queries or flips the
  status back to Connected.
- Double-clicking Connect no longer opens two links on the same ports.
- An out-of-range preset index from the pedal shows an error instead of
  crashing the page.

[Unreleased]: https://github.com/fgbona/OpenSonicX/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/fgbona/OpenSonicX/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/fgbona/OpenSonicX/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/fgbona/OpenSonicX/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/fgbona/OpenSonicX/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/fgbona/OpenSonicX/compare/v0.17.1...v1.0.0
[0.17.1]: https://github.com/fgbona/OpenSonicX/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/fgbona/OpenSonicX/compare/v0.16.1...v0.17.0
[0.16.1]: https://github.com/fgbona/OpenSonicX/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/fgbona/OpenSonicX/compare/v0.15.1...v0.16.0
[0.15.1]: https://github.com/fgbona/OpenSonicX/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/fgbona/OpenSonicX/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/fgbona/OpenSonicX/compare/v0.13.8...v0.14.0
[0.13.8]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.7...v0.13.8
[0.13.7]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.6...v0.13.7
[0.13.6]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.5...v0.13.6
[0.13.5]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.4...v0.13.5
[0.13.4]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.3...v0.13.4
[0.13.3]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.2...v0.13.3
[0.13.2]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.1...v0.13.2
[0.13.1]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.12.3...v0.13.0
[0.12.3]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.12.2...v0.12.3
[0.12.2]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/fgbona/sonicake-pocket-master-editor/releases/tag/v0.1.0
