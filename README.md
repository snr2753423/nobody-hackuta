# NOBODY: Escape Polyphemus

A webcam game of the Cyclops episode from Homer's *Odyssey*, for HackUTA 2026. Your upper body is the controller. You can **forge your own power**: perform any movement 3 times, describe it in plain words, and that movement casts it in combat.

## Demo path
1. Open `http://localhost:3000` in Chrome and allow the camera. A glowing skeleton tracks you in the right-hand panel.
2. Click **Enter the cave**, then **Continue**. Polyphemus asks your name. Answer **"My name is… Nobody."**
3. Fight, seated:
   - **both hands up** = shield, which blocks the club slam
   - **lean left/right** = dodge, out of the boulder's red ring
   - **both arms out** = blast, which damages Polyphemus
4. At half health he cries **"NOBODY IS HURTING ME!"** His brothers come to the cave mouth, laugh, and leave: no one comes for Nobody.
5. Click **⚒ Forge a Power**:
   1. Do a move 3 times (try a thunderbolt throw: high over your right shoulder, down across to your left hip).
   2. Test it, then name and describe it.
   3. **Consult the Oracle**: Gemini returns the ability config.
   4. **Bind** it.
6. Perform your move in the fight to cast it. Blind the Cyclops with the olive stake and escape under the rams. **Play again** restarts.

Keyboard backup: ← → lean, ↑ shield, space blast, 1–3 cast powers (1 casts a built-in backup power if none are forged). Press **D** for raw gesture readings.

## Run it
Run from a clean copy on macOS with Node 26. Verified 2026-11-14: build passes, page serves, the Gemini call works, and gesture tests pass.

```bash
npm ci
```

```bash
cp .env.local.example .env.local
```

Add your key to `.env.local` as `GEMINI_API_KEY=...`. It's optional; without it the Forge uses the offline oracle.

```bash
npm run build
```

```bash
npm start
```

Then open http://localhost:3000. For development, use `npm run dev` instead of build + start.

Gesture recognition tests (synthetic skeletons, no camera needed):

```bash
npm run test:gestures
```

## How it works
- **Pose:** MediaPipe Pose Landmarker (lite) runs in the browser, on device. The model and WASM are served from `public/mediapipe/`, so nothing loads from a CDN.
- **Features:** each frame becomes 14 numbers: elbow and shoulder joint angles, plus wrist and elbow positions relative to the shoulder midpoint, scaled by shoulder width. It also includes shoulder tilt and head offset. No raw pixel coordinates.
- **Presets:** rule-based with hysteresis.
  - Lean uses shoulder tilt plus head offset, so it needs no calibration.
  - Blast fires only when the arms are held out, not while they sweep past.
- **Forge (no training):** each of the 3 samples has its idle frames trimmed and is resampled to 32 frames. The samples are merged into one template (medoid plus DTW barycenter averaging), and the match tolerance comes from how consistent they were.
- **Live recognition:** dynamic time warping over recent movement, at 3 window lengths. A window must also pass four gates:
  - enough motion
  - the same direction as the recorded move (so returning to rest doesn't fire)
  - a similar path length
  - per-feature weights
- **Firing:** a power fires at ≥50% confidence on 2 consecutive frames, then a cooldown starts. Strict/normal/loose sensitivity is set per power.
- **Gemini, one job:** `POST /api/forge` turns your description into `{name, effect, damage, stunSeconds, cooldownSeconds, heal, flavor}`.
  - The effect comes from an 8-item allowlist.
  - It's called once per Forge, never per frame.
  - Every config is clamped for balance on the server.
  - Any failure falls back to an offline keyword oracle, and the Forge shows which one answered.
- **Game:** a Phaser 3 scene drawn entirely in code in Greek black-figure vase style. Audio is synthesized with WebAudio. Forged powers are saved in localStorage.

## Stack
- **Next.js 16 + React 19 + TypeScript:** one page plus one server route, so the Gemini key stays on the server.
- **Tailwind CSS 4:** fast UI styling.
- **MediaPipe Tasks Vision (Pose Landmarker):** on-device pose tracking at webcam frame rate.
- **Phaser 3.90:** reliable 2D rendering, chosen over 3D.
- **Google Gemini** (`@google/genai`, `gemini-3.5-flash-lite`): plain words → structured ability config.
- **Dynamic time warping** (our own code): recognizes a gesture from 3 examples with no model training.

## What was cut
- **More trials** (Sirens, Scylla and Charybdis), accounts, leaderboards, multiplayer: one trial polished end to end beats three fragile ones.
- **A playable blinding or ram-escape phase:** these are shown as story beats and cards.
- **A branching name choice:** the Nobody beat is scripted, so answering "Odysseus" doesn't summon the brothers. It's the obvious next step.
- **Public deploy:** the demo runs on localhost. Deploying needs a Vercel login that wasn't set up.
- **Known limitation:** forged moves that differ only by a small hand motion (wave overhead vs. raise arm overhead) can be confused. Pick moves with distinct arm paths.

## Credits
- [MediaPipe](https://ai.google.dev/edge/mediapipe) Pose Landmarker (Apache 2.0)
- [Phaser](https://github.com/phaserjs/phaser) (MIT)
- [Next.js](https://nextjs.org) (MIT), React (MIT), Tailwind CSS (MIT)
- Google Gemini API via `@google/genai` (Apache 2.0)
- Fonts: Cinzel and EB Garamond (SIL Open Font License) via Google Fonts
- Story: Homer, *Odyssey*, Book 9 (public domain), paraphrased.
- Inspired by [Jiggle Wiggle](https://github.com/cindyzli/jigglewiggle) (TreeHacks 2026, MIT): the idea of webcam-controlled play. Its code and assets were not used.

## Team
Srivanth Rudrangi. Built during HackUTA 2026 with Claude Code.
