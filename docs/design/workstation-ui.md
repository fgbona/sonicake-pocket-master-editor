# Workstation UI (design proposal, branch `design/workstation-ui`)

Status: **approved by the owner as the default interface** (2026-11-27). It will keep improving after it lands.

The goal is an editor that works like a multi-effects workstation (HX Edit, Axe-Edit, Tone Studio,
Neural DSP): **one fixed screen**, not a long page. The pedal stays the source of truth: the screen
mirrors what the unit holds and makes every difference from it obvious.

The first pass was a restyled scrolling page with a row of anchor links. The owner's review said it
read as an evolution of the old look. This pass replaces it with a fixed-screen shell and a tabbed
dock. The owner settled the open questions ("decide você"); the decisions are at the end.

## Principles

1. **The hardware is the truth.** Every edit is sent live to the pedal's edit buffer. *Dirty* means
   "the edit buffer no longer matches the stored slot". It shows at four levels:
   - the sync chip in the preset bar;
   - an amber dot on the loaded entry of the bank list;
   - an amber dot on each changed block's tile;
   - an amber dot on each changed knob, switch or list. It compares against the value last read
     from or saved to the pedal, so turning a knob back clears it.
2. **Signal chain first.** The chain is the middle of the screen. The selected block's panel is
   always under it, fixed, with 88 px knobs.
3. **Music controls.** Knobs turn by vertical drag (Shift = fine), the scroll wheel and the arrow
   keys. Clicking the value (or Enter on a focused knob) lets you type a number. It is clamped and
   snapped, and Escape cancels. Double-click resets the default. Units come from the catalog: the
   Pocket Master's catalog has dB, ms, Hz and cents. The Matribox catalog and models data have no
   units, so its knobs show the unit's own numbers (see "Matribox units").
4. **Stage mode by default.** Dark (light stays on the ☾ button), high contrast, big targets: 40 px
   buttons, 44 px list rows and dock tabs, 88 px knobs in the block panel and 72 px elsewhere.
5. **Banks of three.** Each bank shows CLEAN / RHY / LEAD by position: the Matribox's A/B/C (its D
   is marked FREE), and the Pocket Master's user presets in threes (P01–P03 is bank 1). This is
   only a visual hint: presets are never renamed for it. The save dialogs' role buttons rename on
   purpose (`MTL` → `MTL-RHY` → `MTL-LEAD`).
6. **Destructive actions confirm and back up.** This reuses what already exists: the save dialogs
   (overwrite confirmation + automatic backup), factory reset (two steps), restore all, the
   clone/IR upload confirmation, and Undo/Redo (Cmd/Ctrl+Z).
7. **Protocol stays apart.** No protocol code changed. `usePocketMaster` and `useMatribox` are
   untouched. A read-only adapter (`lib/workstation/device.ts`, `useDevice.ts`) turns either
   hook's state into the same `DeviceView`: the sync state, the dirty blocks and a per-parameter
   dirty check. The shell, the chain, the panels and the dock only read that view.

## Visual system

The target is the class of premium device editors and units with screens: Neural DSP Quad Cortex,
Fractal Axe-Fx / FM9 with Axe-Edit III, Kemper Profiler, Line 6 Helix / HX Edit. What they share,
and what this design takes from them, is **a principle and not a look**: the screen is the device.
None of their exact layouts, logos, colours or trade dress are copied; the drawings are generic
shapes, and the model names are our own (`packages/core`).

| Principle (from that class of product)     | How it is done here                                                                 |
|--------------------------------------------|-------------------------------------------------------------------------------------|
| The device is the canvas                   | A near-black chassis with a fixed film grain at 3.5 % (`body::after`, no pointer events); panels are machined sections, with a 1 px top highlight, a dark seam and an inner shadow. There are no rounded web cards, borders or pills. |
| The preset is the unit's screen            | An OLED-style display: dark glass in **both** themes, faint scan lines, a glowing fixed-width number (`17C`), the name, bank, role and sync LED. |
| The chain is a pedalboard                  | Square blocks tinted by category (drive red, amp orange, cab amber, mod purple, delay blue, reverb teal, dynamics cyan), a gear drawing on each, a lit cable between them, IN and OUT jacks, a dashed empty "+" slot. A bypassed block goes dark and its LED goes out; the selected one glows in its colour. |
| Footswitches under the chain               | FS A–D as stomp caps with LED rings, showing what each switches (CTRL n → its blocks), clickable to switch them like a press. |
| The parameter page is a hardware panel     | Big machined knobs with a lit arc in the block's colour, the value on a small readout, the model on a recessed menu readout, pages of 8 knobs for a model with more. |
| Domain displays, not form widgets          | The global EQ draws its response curve (RBJ biquads) with draggable band nodes; compressor, gate, delay, reverb and EQ blocks get a small screen drawing their behaviour from the live values; the expression pedal shows its heel-to-toe sweep. |
| Keys, LEDs, recessed selectors             | Every button is a key with travel; `role="switch"` controls are lit buttons with an LED (same role and labels); selects and fields are recessed readouts. |
| Type                                       | Barlow Condensed for labels (uppercase, wide tracking), Share Tech Mono for values, both self-hosted through `next/font` (they work offline). |
| Motion                                     | Short presses (90 ms) and LED fades (160 ms) on one cubic-bezier, `--ws-ease`. Nothing moves on its own. All of it is off under `prefers-reduced-motion`. |

Tokens live in `app/workstation.css` (`--ws-*`) and the look in `app/hardware.css`. The EQ display is
in `app/eq.css` and the block screens in `app/viz.css`. Light theme: a daylight, brushed-alloy
chassis with the same layout; the OLED stays dark.

## Layouts

| Width          | Layout                                                                                  |
|----------------|-----------------------------------------------------------------------------------------|
| ≥ 1280 px      | **Workstation shell**: 100vh, no page scroll; only the bank list, the block panel and the open dock tab scroll inside |
| 721 – 1279 px  | Stacked: the same blocks one after the other, big targets, every dock panel shown       |
| ≤ 720 px       | Phone: the existing phone layout (folded preset list, wrapped chain, bottom-sheet menus) |

## Workstation shell (1280 px and up)

```
┌ app bar: OpenSonicX · pedal ··························· ☾ · PT|EN · ● Matribox II Pro · USB ┐
├ preset bar ───────────────────────────────────────────────────────────────────────────────────┤
│ ┌ display ─────────────────────────────────────────────┐  ↶ ↷ [Save…] [Export] [Import]       │
│ │ EDIT BUFFER · ROCK                                    │  [Global options] [Read]   ◯ VOL 72  │
│ │ 17C Drive AD  [LEAD]  ● Edited · not stored in 17C    │                                      │
│ └───────────────────────────────────────────────────────┘                                      │
├ banks ──────────┬─────────────────────────────────────────────────────────────────────────────┤
│ [filter_______] │  experimental notice                                                         │
│ BANK 17 · MTL   │  ╭────╮  ╭────╮  ╭────╮  ╭────╮  ╭────╮  ╭────╮  ╭───╮                       │
│  17A … [CLEAN]  │──│gate│──│ drv│●─│head│──│cab │──│rvb │──│vol │──│ + │   gear drawings,       │
│  17B … [RHY]    │  │DYN │  │DRV │  │AMP │  │CAB │  │RVB │  │VOL │  ╰───╯   ● = edited block     │
│ ▶17C … [LEAD] ● │  ╰▬▬▬▬╯  ╰▬▬▬▬╯  ╰▬▬▬▬╯  ╰▬▬▬▬╯  ╰▬▬▬▬╯  ╰▬▬▬▬╯   ▬ = on/off LED          │
│  17D … [FREE]   │  DSP ▓▓▓▓▓▓░░░ 58 %                                                          │
│ BANK 18         ├─────────────────────────────────────────────────────────────────────────────┤
│  …   (scrolls)  │ ┌ 2. DRV block ── ▣ DRV [model ▾] ─────────────────────── [Remove] (on) ┐  │
│                 │ │     16●        50          14          ← ● = this knob is edited        │  │
│                 │ │    ( ◯ )      ( ◯ )       ( ◯ )        88 px knobs                       │  │
│                 │ │    GAIN       TONE        VOLUME       (panel scrolls inside)            │  │
│                 │ └───────────────────────────────────────────────────────────────────────┘  │
├ dock ───────────┴─────────────────────────────────────────────────────────────────────────────┤
│ [Assistant] [Clones & IRs] [Controls] [Library] [Backups] [Global & EQ]        [Open the dock] │
│ (the open tab's panel, up to 38 % of the screen, scrolls inside)                               │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **App bar + preset bar** are the top bar. The display carries the slot number, the name, the bank
  role chip and the sync chip. Beside it are Undo/Redo, Save, Export, Import, Global options,
  Read and the patch volume. The Pocket Master keeps its live-edit tools in the app bar (Undo,
  Redo, Revert, Save, Copy, Tuner, Read, ⚙) and Volume/BPM in the preset bar.
- **Bank browser** (left): full height, the list scrolls inside. The search, the banks, the role
  chips, the shared prefix of a bank's names and the edited dot all stay.
- **Chain**: big blocks with the rig-view gear drawings (from `design/rig-view`), drag or Alt+arrows
  to move, the LED to switch, + to add, the edited dot, and the DSP meter under it.
- **Block panel**: fixed under the chain, for the selected block. It has the model picker,
  on/off, Remove, and 88 px knobs with their own edited dots.
- **Dock**: real ARIA tabs, folded at start so the chain and block get the room. Click a tab to
  open it, click it again (or the fold button) to fold. Arrow keys move between tabs. Panels stay
  mounted while hidden, so an upload or a chat keeps running. When the assistant proposes a
  capture upload, the Clones & IRs tab opens by itself.

| Dock tab     | Matribox                                                     | Pocket Master                          |
|--------------|--------------------------------------------------------------|----------------------------------------|
| Assistant    | AI tone assistant                                            | AI tone assistant                      |
| Clones & IRs | Clones (NAM/.clo upload, TONE3000), user IRs                 | TONE3000 sign-in and captures, pedal slots |
| Controls     | Footswitches/CTRL, quick knobs, expression, tempo/MIDI, drums | — (the pedal's controls are in ⚙)     |
| Library      | Tone library                                                 | Preset files (export/import), tone library |
| Backups      | Back up / restore all, backups, desktop AI connection        | Backups, desktop AI connection, SysEx log |
| Global & EQ  | The global options and the EQ graph, inline (no dialog)      | The global options, inline (incl. factory reset); read when the tab first opens |

## Stacked (721–1279 px) and phone

```
app bar
preset display (full row) · actions · volume
bank list (left column; folds behind a button on a phone)
chain → DSP → block panel (88 px knobs; 72 px on a phone)
Assistant → Clones & IRs → Controls → Library → Backups → Global & EQ   (all shown, no tabs)
```

## Block panel

A model with few knobs does not leave the panel half empty. The knob row is centred, and beside
it sits the block's live screen (compressor, gate, delay, reverb, EQ) or, for other blocks, its
gear drawing and model name. The model's description is a small secondary line under the knobs.
The Matribox's experimental notice is an amber LED in the preset bar; hovering or focusing it
shows the full text.

```
┌ 3. AMP block ────────────────────────────────────────────────────────────┐
│ ▣ AMP  [model ▾  <our name> <based-on gear>]                [Remove] (●) │
│ ┌ faceplate (amp skin, tube glow) ───────────────────────────────────────┐ │
│ │   64●      50       48      Off                                         │ │
│ │  ( ◯ )   ( ◯ )    ( ◯ )    [═○]     ← value: click to type              │ │
│ │  GAIN    PRES.    VOLUME   BRIGHT   ← drag ↕ / wheel / keys / dbl-click │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
Typing:  [ 64▏ ]  Enter = send (clamped, snapped to the step) · Esc = cancel
```

## Dirty and sync states

| State      | Chip (en / pt)                                                | When                                     |
|------------|---------------------------------------------------------------|------------------------------------------|
| `offline`  | No pedal / Sem pedal                                          | no unit connected                        |
| `reading`  | Reading from the pedal… / Lendo do pedal…                     | connect, Read, preset load               |
| `writing`  | Sending to the pedal… / Enviando ao pedal…                    | save, upload, chain edit in flight       |
| `synced`   | In sync with the pedal / Sincronizado com o pedal             | edit buffer = stored slot                |
| `dirty`    | Edited · not stored in {slot} / Editado · não salvo em {slot} | edits not saved to the slot              |

What each check compares against:
- **Pocket Master:** its restore point, which is the preset as read or saved.
- **Matribox:** a snapshot the adapter takes whenever the unit reports "not edited".

A block counts as dirty when its model, on/off or any value differs. A parameter counts as dirty when
its value differs, or when its block's model changed. A block that was only moved is not dirty,
but the preset still is.

## Matribox units

Units come from the owner's manual (v1.2.2), read for facts only. They are stored in
`packages/core/src/matribox/units.json` (keyed `MODULE:Label`, with a per-model `MODULE:fxid:Label`
override) and shown by `mbFormatValue` (`"-3 dB"`, `"1.2 kHz"`). A parameter keeps no unit when the
manual does not state one.

| Module / label        | Unit  | Why it is certain                    |
|-----------------------|-------|--------------------------------------|
| FREQ Low/Hi Pitch     | st    | the manual says semitones            |
| FREQ Fine (ring mod)  | Hz    | the manual gives ±50 Hz              |
| MOD Detune            | cents | the manual gives ±50 cents           |
| DLY Time R%           | %     | a ratio, named so by the unit        |

These are left without a unit (likely, not stated): DLY Time (ms, from the 20..4000 range only), Rate
(0.1..10, likely Hz), gate Attack/Release/Hold, RVB Pre Delay, CAB/IR Low/High Cut (Hz with 19 / 20001 =
off), EQ block gains (−50..50, not dB), and the 0..100 levels. The global EQ shows Hz, dB and Q, which
`docs/matribox.md` documents.

## Trade-offs

- **T1. The shell moves panels behind tabs.** At 1280 px and up, the assistant, clones, controls,
  library, backups and global settings are one click away instead of a scroll away. Below 1280 px
  everything stays stacked. Tests open the tab they need (`openDock` in `e2e/fixtures.ts`).
- **T2. Restyle and reorganise, not rewrite.** The chain tiles, block panels, dialogs and
  assistant keep their logic and accessible names. The shell is CSS grid
  (`app/workstation.css`) over the existing elements, plus the Dock, SyncStatus, RoleButtons and
  DirtyMark components.
- **T3. No new dependencies.** React state is enough (the dock tab, the global-options dialog), so
  there is no Zustand.
- **T4. The dock starts folded**, giving the block panel the most room. Opening a tab takes up to
  38 % of the screen height; the block panel then scrolls inside.

## Decisions (owner: "decide você")

1. Matribox A/B/C show CLEAN/RHY/LEAD by position and D shows FREE. This is a visual hint only;
   nothing is renamed. The Pocket Master's user presets follow the same rule in threes.
2. No CRUNCH or SOLO roles.
3. The dock has real tabs, which replace the first pass's anchor links.
4. The light theme stays; dark is the default.
5. Knobs are 88 px in the block panel and 72 px elsewhere (48 px for the patch volume in the preset
   bar).
6. Each knob, switch and list gets its own dirty marker.
7. Matribox units are shown only where the data gives them. The ones missing are listed above.

## Still open

- Should the dock remember its last tab across visits?
- Should the preset bar and the app bar merge into one row once the toolbar actions are reworked?
