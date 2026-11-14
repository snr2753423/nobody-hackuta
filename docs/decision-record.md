# Decision record

Project: **NOBODY** — HackUTA 2026. Grill run 2026-11-14 ~2 PM, 4 questions asked (prompt answered the fixed three).

## Product
A webcam-controlled retelling of the Polyphemus episode (Odyssey, Book 9). The player's upper body is the controller. Three preset gestures (shield, dodge, blast) plus **Forge a Power**: perform any movement 3 times, name it, describe it in plain words, and it becomes a bound ability recognized by dynamic time warping over normalized joint-angle trajectories. Odysseus survives by invention, so the player survives by inventing their own controls.

## Who
HackUTA 2026 judges, science-fair style: 3 min presentation + 2 min Q&A, Sunday 1 PM. Criteria: Robustness, Theme (Homer's Odyssey), Creativity. A first-time judge must understand and finish the core demo in 90 seconds, seated.

## Hours left
~10 h. Started ~2 PM Saturday; Devpost due 11:59 PM tonight. A complete, submittable build must exist before polish.

## Named API
- **MediaPipe Pose Landmarker** (`@mediapipe/tasks-vision`), in browser, on device.
- **Gemini API** — only to convert a plain-words ability description into a structured ability config (name, effect, damage, stun, cooldown) from an allowlist. Called once per Forge, never per frame. Key read from `GEMINI_API_KEY` in `.env.local` (user supplied, gitignored). Offline fallback to preset configs is mandatory.
- Phaser 3 for rendering. No other sponsor integrations.

## Demo
1. Title card → "What is your name, stranger?" → player is named **Nobody**.
2. Fight Polyphemus with shield (both hands up), dodge (lean), blast (arms out).
3. Mid-fight (HP ≤ 50%): Polyphemus cries "Nobody is hurting me!" — the other Cyclopes laugh, the reinforcement wave is cancelled on screen.
4. Forge a Power: 3 samples → name + description → visible Gemini step → bound ability fires in combat.
5. Win → escape narrative card; lose → restart.

Decision 1: **Both, by time** — a pre-forged power is loaded as backup; the judge forges live when time allows.

## Must-have
- Webcam + glowing skeleton overlay.
- 3 preset gestures, seated, reliable, distinct.
- Polyphemus fight: boss HP, attacks with telegraphs, player HP, score, win, lose, restart.
- Forge: record 3 samples, DTW template, confidence threshold, cooldown, bind to ability, fire in combat.
- Gemini → validated config with offline fallback, step visible in the Forge UI.
- Nobody story: intro dialogue (name = Nobody), mid-fight "Nobody is hurting me" mechanic cancelling reinforcements (Decision 2), outro escape card.
- Greek black-figure vase art style, all drawn in code (Decision 3).

## Cut
- Additional trials (Sirens, Scylla & Charybdis), accounts, leaderboards, multiplayer.
- Any backend beyond one Next.js API route for Gemini.
- Neural network training of any kind.
- Deployment as a blocker (localhost on Mac is the demo target).
- External art/audio assets (all drawn/synthesized in code).
- Full blinding-stake / ram-escape playable phases (shown as story cards only).

## Risks
- Pose noise causing false fires of presets or forged gestures → hysteresis, hold frames, cooldowns, confidence threshold, negative tests.
- DTW custom gesture overlapping with preset gestures → negative-test against presets; reject templates too close to presets.
- Gemini key format / model availability unverified → test live; fallback always works.
- Lighting/camera at the venue → seated upper-body only, visibility check in UI.
- Time: 10 h. Build order enforced; polish last.

## Accepted unknowns
- Venue lighting and camera angle (mitigate with a calibration screen).
- Exact Gemini model ID available to this key — verify against live docs at build time.
- Whether judges will stand or sit — design for seated, works standing.
- Audio in a loud venue — synthesized WebAudio SFX, not load-bearing.

## Rejected
- 3D rendering (Three.js) — Phaser 3 for reliability.
- Raw-pixel gesture matching — joint angles + trajectories only.
- Gemini per frame or for gesture recognition — config translation only.
- Copying Jiggle Wiggle app code, game logic, or assets — pattern reference only for MediaPipe setup.
- Full arc mechanics (name choice, stake, ram phases) — dialogue + one mechanic chosen (Decision 2).
- Dark-cave neon and pixel-art styles — Greek vase chosen (Decision 3).

## Completion criteria
All 12 acceptance tests in the brief pass on localhost (`npm run build && npm start` and `npm run dev`), verified by running, with failures recorded in `docs/final-report.md` and `.hackathon/run-ledger.md`. Devpost draft, README, pitch, and demo script exist before 11:59 PM.
