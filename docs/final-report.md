# Final report: NOBODY (HackUTA 2026)

Status as of Saturday 2026-11-14, ~3:30 PM. Everything below is copied from `.hackathon/run-ledger.md`, not from memory.

## Built
- **NOBODY: Escape Polyphemus**, a webcam-controlled retelling of the Cyclops episode (Odyssey, Book 9). One trial only.
- **Pose tracking**: MediaPipe Pose Landmarker (lite), in browser, on device. Model and WASM are self-hosted in `public/mediapipe/`, so no CDN is needed at the venue. A glowing skeleton overlay is drawn on the mirrored webcam feed.
- **Gesture features** (`src/lib/gesture/features.ts`): a 14-D vector of joint angles (elbows, shoulders) and body-relative trajectories (wrists and elbows relative to the shoulder midpoint, divided by shoulder width), plus shoulder tilt and head offset. No raw pixel coordinates.
- **Three preset gestures** (`src/lib/gesture/presets.ts`), all seated, with hysteresis:
  - Both hands up → shield (blocks the club slam).
  - Lean left/right → dodge between three lanes (escape the boulder). It uses a baseline-free lean score: absolute shoulder tilt plus head offset from the shoulders.
  - Both arms out → energy blast. It fires only once the arms are held still, so sweeping up into a shield never fires it.
- **Forge a Power** (`src/components/Forge.tsx`, `src/lib/gesture/dtw.ts`):
  1. The player records 3 samples of 2.4 s each.
  2. Each sample has its idle start and end trimmed (noise-aware), is resampled to 32 frames, and the 3 are merged into one template (medoid plus DTW barycenter averaging). No training.
  3. The tolerance comes from how consistent the 3 samples were.
  4. Live recognition uses dynamic time warping over 3 window lengths, normalized by (n+m)/2. A window must also pass four gates: enough motion (amplitude), a same-direction check for one-way moves, a similar total path length, and per-feature weights from the template.
  5. A power fires at ≥50% confidence for 2 consecutive frames, then enters a cooldown. Each power has a sensitivity setting (strict/normal/loose).
  6. Held poses become static templates. This is the fallback "custom pose" creator, inside the same pipeline.
  7. The Forge has a live "Test it" meter before binding. Powers persist in localStorage, up to 3.
- **Gemini, one role only** (`src/app/api/forge/route.ts`): it turns the plain-words description into `{name, effect, damage, stunSeconds, cooldownSeconds, heal, flavor}`.
  - The effect must come from an 8-item allowlist (lightning, fire, ice, wind, quake, light, wave, vines).
  - It's called once per Forge, never per frame.
  - Every config passes `validateAbility()`, which clamps it and applies a balance rule.
  - If anything fails, the route falls back to an offline keyword oracle.
  - The Forge UI shows the step: "The Oracle (Gemini) reads your words…", then a badge with the model and latency, or "Oracle silent: offline preset config". A "simulate Gemini offline" checkbox demonstrates the fallback.
- **Phaser 3 fight** (`src/game/FightScene.ts`), drawn entirely in code in Greek black-figure vase style:
  - The boss has 100 HP. He telegraphs boulder throws (lean out of the red ring) and club slams (raise the shield).
  - The player has HP. The score is shown as κλέος (glory).
  - Win state: the olive stake blinds the eye. Lose state: a defeat card. Restart works.
  - Stun stops boss attacks. The single eye tracks the player.
- **The Nobody story in gameplay**:
  - Intro card: Polyphemus asks your name. The player chooses: "My name is… **Nobody**" (the lie) or "I am **Odysseus**" (the truth).
  - Opening line: "I will eat Nobody LAST!"
  - At 50% boss HP, the Nobody mechanic triggers. He cries "NOBODY IS HURTING ME!", three Cyclopes appear at the cave mouth with a reinforcement warning, they answer "If NOBODY is hurting you… pray to Poseidon," and the banner reads "REINFORCEMENTS CANCELLED: No one comes for Nobody (+500 Trickster)". Phase 2 is enraged.
  - Victory: "NOBODY HAS BLINDED ME!", then the escape-under-the-rams card.
- **Audio**: synthesized with WebAudio. No asset files.
- **Extras** (beyond the brief, see removal paths):
  - keyboard backup controls
  - debug metrics overlay (D key)
  - per-power sensitivity picker
  - `?selftest` timer-loop flag
  - synthetic-skeleton test harness (`npm run test:gestures`)

## Ran
Copied from the run ledger.
- `npm run test:gestures` uses synthetic MediaPipe-shaped skeletons with noise and tempo/amplitude variation. **ALL PASS** (last run ~3:10 PM):
  - **Presets**: shield-only, blast-only, dodge left, dodge right. Slow 12° leans both ways, small 9° lean, idle fidget → nothing. Started mid-lean then sat upright → neutral.
  - **Forged movements**: 8 moves (wave overhead, arm circle, reverse arm circle, two-arm pump, punch across, cross arms, swipe up, sweep out) are each recognized 6/6. None fired on any distinct movement across 18 performed movements, including the shield/blast/lean presets.
  - **Reverse motions**: swipe-up template on swipe-down, sweep-out on sweep-in, and circle on reverse circle (both ways) are all 0/6.
  - **Held pose**: detected as static, fires when held, doesn't fire on idle/shield/blast.
  - **Wave vs. raise:** this was a near-miss at 4/6 (a "wave overhead" template firing on "raise arm overhead"). After the rhythm gate it's 0/6, and it's now a hard test.
- `npx tsc --noEmit` and `npx eslint src scripts`: clean.
- `npx next build` (Next 16.4.6): compiled. `/` is static, `/api/forge` is dynamic.
- `/api/forge` with the key (dev server, curl):
  - Thunderstrike → `gemini-3.5-flash-lite`, 879 ms, `{lightning, 12, stun 1.5, cd 5}`.
  - Heal description → `{light, 0 dmg, heal 20}`.
  - Adversarial "9999 damage nuclear laser" → clamped to `{light, 30, 3, 10}`.
- `/api/forge` without Gemini:
  - The `x-force-offline` header returns the offline config.
  - The production server started with `GEMINI_API_KEY=` (empty) returns `{"source":"offline","reason":"No GEMINI_API_KEY set", …}`.
- **Browser pane, keyboard controls, dev server**:
  - A full playthrough reached victory: the Nobody beat at 50%, phase 2, the "Nobody escaped." card.
  - Restart, then backup power key 1: boss 100→82, 1.2 s stun, pending attack cancelled.
  - Idle until the player died: the "Polyphemus ate Nobody last." card.
  - The Forge modal opens.
- **Production server** (`next start`, no key, `/?selftest`): a scripted run from title to victory took 25 s. No console errors.
- **Live webcam** (user, Chrome on the Mac):
  - Test 1: dodge unreliable, forged power over-firing. Both fixed.
  - Test 2: dodge inverted, return motion firing the power. Both fixed.
  - Test 3: "working now", after re-forging with a "Zeus's Thunderbolt" throw.

## Acceptance tests
| # | Test | Status |
|---|---|---|
| 1 | Live camera shows accurate landmarks | Passed: user's live tests in Chrome (skeleton tracked) |
| 2 | Three presets → three actions | Passed: synthetic suite, plus the user's live retest after the dodge fix |
| 3 | Playable, winnable, win/lose/restart | Passed: run in the browser pane (dev and prod) |
| 4 | Record 3 samples of a new movement | Passed: user, live |
| 5 | Recognized with no retraining | Passed: synthetic suite, plus user live ("working now") |
| 6 | Assign it to an ability | Passed: user, live (Forge → bind) |
| 7 | Performing it activates the ability in combat | Passed: user live ("working now"); the casting path was also verified with key 1 |
| 8 | Gemini → valid supported config | Passed: curl, 3 descriptions including adversarial |
| 9 | Playable with Gemini unavailable | Passed: no-key prod server returns the offline config; the game itself never calls Gemini |
| 10 | First-time judge completes core demo in 90 s | **Not tested with a real first-time player.** A perfect autopilot finished title to victory in 25 s. A human with gestures is expected around 60–90 s. Do a dry run with a friend before judging. |
| 11 | Nobody story visible in the game | Passed: intro name choice, the 50% mechanic, victory lines (seen in the pane) |
| 12 | Runs end to end on localhost with no errors | Passed: production build plus scripted run, zero console errors |

## Assumptions
- The demo laptop's webcam sees the judge from roughly the waist up while seated, in normal indoor light.
- MediaPipe "left" landmarks are the person's left. After mirroring, they appear on screen-left. The user's live tests behave accordingly.
- Judges forge live only if time allows. Otherwise the presenter forges a backup power before judging, saved in localStorage. With no forged powers, key 1 casts a built-in backup ability (Athena's Lightning).
- `gemini-3.5-flash-lite` stays available to this key. If not, the route tries `gemini-flash-lite-latest`, then falls back to offline. `GEMINI_MODEL` overrides the model.
- Jiggle Wiggle (TreeHacks 2026) was the inspiration. Its repository was **not read or copied**. All code, art, and audio were written in this session.

## Blocked or skipped
- **Public deploy: blocked.** Vercel is the platform default for Next.js, but there's no Vercel CLI or session on this machine (`which vercel` → not found, no `~/.vercel`). Deploying needs a Vercel login, and the brief says to ask before any login and not to block on deployment.
  - **To unblock:** with your approval, run `npx vercel` and log in, then set `GEMINI_API_KEY` in Vercel project settings (not in the repo). Deploy, open the URL, and click the demo path. The camera needs HTTPS, which Vercel provides.
  - **Demo target:** localhost on the Mac.
- **Real-camera automated tests: not possible.** The in-app browser blocks the camera. Live camera behavior was verified only by the user, three rounds.
- **90-second first-time-judge test (acceptance #10):** not run with a real person yet.
- **Wave-vs-raise near-miss:** fixed after the first ship pass (see below). Mitigations: the Forge tip asks for moves with distinct arm paths, and the strict sensitivity setting.
- **Repository:** pushed to https://github.com/snr2753423/nobody-hackuta (public) at commit 7cc0249. Verified: the page loads logged out, `.env.local` returns 404, and `.env.local.example` is blank.
- **Demo video: not recorded.** It needs your camera and voice. The script is in `docs/demo-script.md`.
- **Pitch timing:** the script is timed to 3:00 (HackUTA's format), not the pitch skill's default 4:00.

## Post-ship fixes (~4:15–4:45 PM)
- **Name choice:**
  - The intro offers "Nobody" (the lie) or "Odysseus" (the truth).
  - Odysseus path: the brothers answer his call, stay at the cave mouth, and every boulder attack covers two lanes (one safe lane).
  - Odysseus path lines: "ODYSSEUS HAS BLINDED ME!", a different end card pointing back to Homer's lie, and a "Try again as Nobody" button. No Trickster bonus.
  - Verified both paths with the browser-pane autopilot (dev, `?selftest`):
    - Odysseus: reinforced, max 2 lanes, brothers visible, victory "Odysseus escaped, the hard way."
    - Then "Try again as Nobody": 1 lane, "REINFORCEMENTS CANCELLED" banner, "Nobody escaped."
- **Rhythm gate:**
  - Direction reversals (with 25% hysteresis) are counted in the template's 4 highest total-variation features. A window's count must be within max(2, 35%) of the template's.
  - `npm run test:gestures`: ALL PASS. Wave overhead is 6/6, and 0/6 on raise and swipe-up. The near-miss exemption was removed.
  - Swipe-up firing during a wave is classed as a correct prefix match, since a wave starts with a swipe up.
- `npx tsc --noEmit`, `npx eslint`, and `npx next build`: clean. No console errors.

## Ship artifacts
- `pitch/story.md`, `pitch/script.md` (3:00), `pitch/storyboard.md`, `pitch/qa.md`, `pitch/recovery.md`
- `docs/demo-script.md` (104 s video table)
- `README.md` (run commands verified from a clean copy: `npm ci`, build, start, Gemini call, gesture tests)
- `devpost-draft.md`
- Hostile Q&A (grill-judge agent) flagged six overclaims, and all were corrected:
  - "literally survives by inventing" → "can invent", since forging is optional
  - "saved you a wave" → removed, since the reinforcements never arrive on any path
  - "Test it doesn't fire when still" → not claimed
  - synthetic numbers are now labeled as synthetic
  - live testing is now described as one person over three rounds, two of which found bugs

## How to remove an extra
- **Keyboard backup controls**: delete the `keydown`/`keyup` effect in `src/app/page.tsx` and the `keyState` reads in `FightScene.update()`. Keep them for an emergency demo.
- **Debug overlay (D key)**: delete the `debug`/`metrics` state and the overlay block in `src/components/CameraPanel.tsx`.
- **Sensitivity picker**: remove `SensitivityPicker` from `Forge.tsx` and `page.tsx`. Matching then defaults to `"normal"`.
- **`?selftest` flag**: delete the spread `...(… has("selftest") …)` in `src/components/GameCanvas.tsx`, and the `__nobodyGame` debug handle on the line above it.
- **Gesture test harness**: delete `scripts/gesture-test.ts`, the `test:gestures` script, and the `tsx` devDependency.
- **Gemini** (if ever needed): delete `src/app/api/forge/route.ts`. The Forge already falls back to `fallbackAbility()` on any network error.

## Next
- Do a dry run of the 90-second judge path with a first-time player. Tune boss HP and attack tempo if it runs long.
- Forge the backup demo power on the judging laptop the night before, in the browser profile used for the demo.
- Let the player record a "this is NOT my move" sample, to tune their power's boundary.
- Deploy to Vercel once a login is approved.
- More trials (Sirens, Scylla and Charybdis) are deliberately cut. They're the obvious "what's next".
