# Scope

## Goal
Prove that a seated player can fight Polyphemus with their body, invent a brand-new control by performing it 3 times, and use it to win — while the Nobody deception plays out in the game itself.

## Demo path
1. Open `http://localhost:3000`. Title screen "NOBODY", camera permission, skeleton overlay glows on the player. Calibration check: "Upper body visible ✓".
2. Click **Begin**. Story card: Odysseus's crew trapped in the cave. Polyphemus: "What is your name, stranger?" → "My name is **Nobody**."
3. Fight. Boss telegraphs attacks (boulder throw = dodge by leaning; club slam = shield with both hands up). Player fires **blast** with both arms out. Boss HP, player HP, score visible. Gesture HUD lights up on each detection.
4. At boss HP ≤ 50%: Polyphemus bellows "Cyclopes! **Nobody** is hurting me!" → silhouettes of other Cyclopes appear at the cave mouth: "If nobody is hurting you, pray to your father Poseidon." → they leave; on-screen "Reinforcements: cancelled — no one comes for Nobody."
5. **Forge a Power** (button, pauses fight; or from title screen). Record 3 samples with countdowns → quality check (consistency score) → name + plain-words description → "Consulting the oracle (Gemini)…" panel shows the returned JSON config (or "Oracle silent — using preset config") → bind. If no time, a pre-forged backup power is loaded.
6. Resume fight; performing the forged movement fires its ability (effect + damage/stun) with a cooldown ring on the HUD.
7. Boss HP 0 → victory: blinded Cyclops card, escape under the ram, "Nobody escaped." Score. Restart. Player HP 0 → defeat card, restart.

## In scope
The single vertical slice: one Next.js page with webcam + MediaPipe Pose, gesture engine (3 presets + DTW custom templates), Phaser 3 Polyphemus scene with story beats, Forge flow, one `/api/forge` route calling Gemini with allowlist validation and fallback, localStorage persistence of forged powers. Greek black-figure art drawn in code, WebAudio-synthesized SFX.

## Out of scope
- Additional trials (Sirens, Scylla & Charybdis), accounts, leaderboards, multiplayer.
- Any backend beyond the one `/api/forge` route.
- Neural network training.
- Deployment as a blocker.
- External art/audio assets.
- Playable blinding-stake / ram-escape phases (story cards only).
- Any sponsor integration other than Gemini.

## Data plan
| Step | Data |
|---|---|
| 1 Camera/skeleton | Real: live webcam → MediaPipe Pose Landmarker (lite model from Google CDN, WASM from jsDelivr). |
| 2 Story | Static dialogue strings in code (paraphrased from Odyssey Book 9, public domain). |
| 3 Fight | Real gesture input; boss pattern is a scripted state machine with randomness. |
| 4 Nobody beat | Scripted trigger at boss HP ≤ 50%. |
| 5 Forge | Real recorded samples → joint-angle feature sequences → DTW-averaged template in localStorage. Ability config: real Gemini response validated against allowlist; fallback = keyword-matched preset config (marked "offline"). Backup forged power: a real template recorded by the presenter before judging and stored in localStorage (plus an "export/import" JSON not required). |
| 6 Custom fire | Real DTW match over sliding window, threshold + cooldown. |
| 7 End states | Real game state. |

## Risks
| Risk | Fallback |
|---|---|
| MediaPipe CDN unreachable at venue | Self-host model + WASM in `/public` (download once during build). |
| Preset false fires | Hold-frames + hysteresis + per-gesture cooldown; keyboard fallback keys (1/2/3/4) for debugging and emergency demo. |
| Custom gesture unreliable | Fallback rule: ship a clearly labeled static custom-**pose** creator using the same pipeline. |
| Forged gesture collides with presets | At bind time, DTW-test the template against preset-like motion; warn the player. Custom match suppresses preset firing for that frame. |
| Gemini fails / no key / bad JSON | Allowlist validator + keyword fallback; UI states "offline oracle". |
| Low light / partial body | Visibility check banner; seated upper-body only. |

## Done means
All 12 acceptance tests in the brief pass on localhost (`npm run build && npm start` and `npm run dev`), verified by running, with failures recorded in `docs/final-report.md` and `.hackathon/run-ledger.md`. Devpost draft, README, pitch, and demo script exist before 11:59 PM.
