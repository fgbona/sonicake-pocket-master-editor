# Hardware tests before 1.0

What only the real pedal can check (milestone 1.0.0). About 45 minutes; a guitar is needed only
for step 4. Before anything: close SonicMaster and every other editor tab (another client on the
port steals replies), and keep a backup: the editor backs up each slot before writing it.

## 1. Firmware version (#101), 2 min

Pedal on USB, nothing else connected to it:

    node apps/mcp/scripts/probe-pedal.ts

It only reads. If no line says `VERSION?`, run it again with `--scan` (tries the read queries no
one has mapped, about 1 minute). Send the log file it prints at the end.

## 2. Global options (#90), 10 min

Web editor (or desktop app) over USB, gear button:
- The values shown match the pedal's own menus: master, levels, mode, EXP/FS type, backlight, ECO.
- Change one level, the backlight and ECO; check them on the pedal; put them back.
- Do not touch factory reset.

## 3. Bluetooth (#89), 15 min

Pedal's Bluetooth on, USB unplugged. In Chrome, *Connect via Bluetooth*:
- Computer: turn a knob with Live edit on and hear it; save to a spare slot (backup first, the
  default); restore that slot from the Backups panel.
- Switch the pedal off while connected: the editor says it disconnected.
- Android phone, Chrome, same site: connect, read the preset, turn a knob.

## 4. TONE3000 from the web editor (#91), 10 min

TONE3000 panel: sign in, search a capture, install it into an **empty** profile slot (slot 1
holds Randall SA). Pick it on AMP and play.

## 5. Phone layout (#92), 5 min

On the Android phone: the preset list folds behind its button, the arrows under the tiles move a
block in the chain, the model menu opens at the bottom of the screen.

Write down for each step: OK, or what happened. Each result closes its issue or turns into a fix.
