# Changelog

All notable changes to this project are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/fgbona/sonicake-pocket-master-editor/compare/v0.13.7...HEAD
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
