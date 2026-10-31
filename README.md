# Voice-Tendencies

Sideline Tendencies: live opponent tendency lookup by voice or typing. Shows only the current opponent (see `OPPONENT`).

## Shared game (multiple devices)

1. On one device tap **Start game**, then **Add a device** to send the join link (or read the code to someone who taps **Join game**).
2. Any device in the game can enter a situation (voice, typing + Enter, or the buttons). Every device shows it, and every device with **Voice reply: on** reads it out.
   Example: type on the phone, earbuds connected to the tablet, tablet speaks it.
3. The game stays joined for 12 hours on each device; **Leave** ends it there.

Only one device should have **Start hands-free** on if another device is playing audio through a speaker; otherwise the mic hears the other device talking.

## Notes

Each device carries a person's name (set it when you start or join a game, or tap your name in the game bar). Phone and tablet can both be "Drew".

Say it hands-free or type it in the main box:

| Say | What happens |
|---|---|
| "note 22 is limping" | Note to everyone in the game |
| "send note to Mike 22 is limping" | Note for Mike only; read out on Mike's devices |
| "save note for later check punt protection" | Saved for later, never read out during the game |
| "note" … "Go ahead" … then the note | Two-step version of any of the above ("send note to Mike" works too) |
| "what notes do I have" / "read my notes" | Reads your unread notes |
| "read all my notes" | Reads every note sent to you this game |
| "what's saved for later" | Reads your for-later notes |
| "cancel" | Drops a two-step note |

- **Quick note** panel: type a note and pick who it goes to (Everyone, a person, For later).
- **Notes** button: every note on this device, grouped by game, with All / For me / For later tabs and search. It turns red when notes for you are waiting.
- Each note is tagged with the time, who sent it, who it's for, and the situation on screen.
- **Share / copy** exports a game's notes. Notes live in the browser on each device, so export after the game to keep them.

## Files

- `index.html` — page, opponent data, lookup engine. Weekly opponent updates change this file only.
- `game.js` — shared game + notes. Do not drop the `<script src="game.js">` tag or the `GAME.*` hook lines from `index.html` during weekly updates.

Sync runs through the free ntfy.sh relay. Anyone with the game code can read that game's messages, so codes are random per game.
