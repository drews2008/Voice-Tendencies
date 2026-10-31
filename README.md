# Voice-Tendencies

Sideline Tendencies: live opponent tendency lookup by voice or typing. Shows only the current opponent (see `OPPONENT`).

## Shared game (multiple devices)

1. On one device tap **Start game**, then **Add a device** to send the join link (or read the code to someone who taps **Join game**).
2. Any device in the game can enter a situation (voice, typing + Enter, or the buttons). Every device shows it, and every device with **Voice reply: on** reads it out.
   Example: type on the phone, earbuds connected to the tablet, tablet speaks it.
3. The game stays joined for 12 hours on each device; **Leave** ends it there.

Only one device should have **Start hands-free** on if another device is playing audio through a speaker; otherwise the mic hears the other device talking.

## Notes

- Hands-free: say **"note"** followed by the note ("note 22 is limping"), or say "note", wait for "Go ahead", then say it. "Cancel" drops it.
- Typed: the **Notes** panel, or type `note ...` in the main box and press Enter.
- Every note is tagged with the time, device name, and the situation on screen, and goes to every device in the game. Notes from other devices are read out loud if that box is checked.
- **Copy / share all** exports the notes after the game.

## Files

- `index.html` — page, opponent data, lookup engine. Weekly opponent updates change this file only.
- `game.js` — shared game + notes. Do not drop the `<script src="game.js">` tag or the `GAME.*` hook lines from `index.html` during weekly updates.

Sync runs through the free ntfy.sh relay. Anyone with the game code can read that game's messages, so codes are random per game.
