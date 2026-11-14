# Run ledger: NOBODY (HackUTA 2026)

## Grill: ~2:05 PM
- grill-me run: 4 questions (demo path, Nobody arc depth, art style, Gemini key). Prompt covered product/who/hours/stack.
- Decisions: backup pre-forged power + live forge by time; dialogue + one mechanic ("Nobody is hurting me" cancels reinforcements); Greek black-figure art drawn in code; key supplied by user into gitignored `.env.local`.
- Wrote docs/decision-record.md, docs/scope.md.

## Slice: ~2:15–3:30 PM
- Scaffolded Next.js 16.4.6 + React 19.3 + Tailwind 4 (create-next-app), Phaser pinned to 3.90.0 (npm pulled 4.x by default; brief requires Phaser 3), @mediapipe/tasks-vision 1.2.3, @google/genai 3.3.0.
- Self-hosted MediaPipe WASM + `pose_landmarker_lite.task` in /public/mediapipe (no CDN dependency at the venue).
- Gemini: listed models with the key (works), chose `gemini-3.5-flash-lite` with `gemini-flash-lite-latest` fallback.
- Built: gesture features (joint angles + shoulder-normalized trajectories), preset detector with hysteresis, DTW template builder (trim → resample → medoid → DTW barycenter averaging) and sliding-window matcher, engine, Phaser FightScene, Forge flow, /api/forge.

## Prove (automated, no camera): ~3:30 PM
- `npm run test:gestures` (synthetic skeletons): ALL PASS.
  - Presets: shield-only, blast-only, dodge-left-only, dodge-right-only, idle → nothing.
  - Found + fixed: raising arms sideways into shield passed through the "arms out" zone and fired blast. Added wrist-stillness gate. Re-run passes.
  - DTW: 5 forged movements × 9 performed movements × 6 noisy trials: each recognized itself 6/6, 0 false fires on all others (incl. shield/blast/lean/idle).
  - Held-pose templates (fallback creator) detected as static, fire when held, don't fire on idle/shield/blast.
- `npx tsc --noEmit`: clean. `npx eslint src scripts`: clean.
- `/api/forge` via curl against dev server:
  - "Thunderstrike: summon lightning and briefly stun" → gemini-3.5-flash-lite, 879 ms, {lightning, 12 dmg, 1.5 s stun, 5 s cd}.
  - "Athena Mend: heals my wounds" → {light, 0 dmg, heal 20}.
  - Adversarial "9999 damage nuclear laser" → clamped to allowlist max {light, 30 dmg, 3 s stun, 10 s cd}.
  - `x-force-offline: 1` → offline keyword config {lightning, 15 dmg, 1.5 s stun}.
- Browser pane (keyboard backup controls; camera is blocked in the pane):
  - Pane hidden → rAF did not fire, Phaser clock frozen (environment, not a bug). Asked user to show pane.
  - Autopilot playthrough: title → intro → "My name is… Nobody" → fight → Nobody beat triggered at 50% → phase 2 → boss 0 → stake/blind → "Nobody escaped." victory card (score 5418, 22 s).
  - Play again → key 1 (backup power) → boss 100→82, stun 1.2 s, pending attack cancelled → idle → player HP 100→0 → "Polyphemus ate Nobody last." defeat card.
  - Forge modal opens from defeat screen.

## Pending
- Live camera test by the user in a real browser (acceptance tests 1, 2, 4–7, 10).

## User live test feedback: ~2:45 PM
- User (real webcam, Chrome): "dodge is not working that well"; forged power "over recognizing" the recorded move.
- Dodge root cause found: neutral-posture baseline adapted (α=0.03/frame) whenever the lean was below threshold, so a slow natural lean was absorbed before it triggered. Fix: lean = summed normalized score of shoulder tilt + head shift + torso shift; enter ±1.0 for 2 frames, exit below ±0.55 for 3 frames; baseline adapts only near neutral at α=0.01; recalibrated at each fight start.
- Forge fix: tolerance = clamp(1.3·worst self-distance + 0.02, 0.045, 0.12) (was up to 0.20); motion gate 0.55× template amplitude; per-power sensitivity strict/normal/loose (0.75/1/1.3× tolerance) in Forge test step and power list; saved templates re-tuned on load.
- Tests extended: slow 12° leans (L/R), sideways slide without tilt, near-miss movements (raise arm without waving, wave with the other hand, arm out-and-down, big fidget). Fixed a synthetic-skeleton artifact (forearm flip at 100°).
- `npm run test:gestures`: ALL PASS. 5 forged moves 6/6 each; 0 false fires across 13 movement types.
- Pending: user re-test with real camera.

## User live test #2 feedback: ~3:00 PM
- User: dodge "working opposite" (dodge shown while upright, nothing when leaning); forged power fires on the move AND on the opposite motion (returning to origin).
- Dodge root cause: lean baseline captured from the first tracked frame of each fight, right after clicking the intro button (likely leaning toward the trackpad) and then frozen near-neutral → upright read as a lean, leaning the other way cancelled it. Fix: baseline-free lean score = absolute shoulder tilt / 8° − head offset from shoulder midpoint / 0.3 sw; only a tiny clamped bias (±4°, ±0.1 sw) adapts slowly while upright.
- Reverse-motion root cause: DTW distance was normalized by warping-path length, so a long path through cheap middle frames made a reversed movement score low. Fix: normalize by (n+m)/2; reject windows whose net feature change opposes the template's (cos ≤ 0.6) for one-way moves; reject windows with path length outside 0.7–1.6× the template's; weight features by how much they move in the template.
- Also found: idle trimming never trimmed under realistic jitter (templates 2.1 s for a 1.2 s move). Fix: noise-aware threshold max(20% peak speed, 2.5× quiet speed).
- `npm run test:gestures`: ALL PASS, including: started-mid-lean then upright = neutral; 9° and 12° slow leans both ways; reverse motions 0/6 for swipe up/down, sweep out/in, circle/reverse circle; 8 forged moves 6/6 each; 0 false fires on distinct movements.
- Known near-miss (reported, not hidden): "wave overhead" template fires on "raise arm overhead" 4/6 — same big arm path, differing only by hand waving. Forge tip now steers players to moves with distinct arm paths.

## User live test #3: ~3:15 PM
- User re-forged (suggested "Zeus's Thunderbolt" throw) and retested: "working now" (dodge + forged power).

## Acceptance pass (production build): ~3:25 PM
- `npx next build`: compiled, / static, /api/forge dynamic, no errors.
- `GEMINI_API_KEY= next start -p 3001` (no key): /api/forge → {"source":"offline","reason":"No GEMINI_API_KEY set", lightning 15 dmg 1.5 s stun}. Page 200. Model (5.8 MB) + WASM (14.7 MB) served locally.
- Added `?selftest` flag (Phaser timer loop) so automated checks run while the pane is hidden.
- Scripted run on prod build (`/?selftest`): title → intro → Nobody → fight → Nobody beat → victory card "Nobody escaped." in 25 s total (19 s fight, perfect autopilot). Console errors: none.

## Ship: ~3:40–4:00 PM
- deploy-fast: BLOCKED. No Vercel CLI or session (`which vercel` → not found; no ~/.vercel). Not logged in, per the brief. Localhost is the demo target.
- hackathon-pitch: wrote pitch/story.md, script.md (timed to HackUTA's 3:00), storyboard.md, qa.md, recovery.md. grill-judge hostile pass: 3 hard questions (Nobody beat is scripted; only the developer has tested live; forging is optional) added to qa.md with honest answers. 6 overclaims cut or relabeled.
- demo-video: docs/demo-script.md, 104 s, 14 rows. Not recorded (needs the user).
- readme-writer: README.md. Clean-copy verification in scratchpad: `npm ci` ok, `npm run build` compiled, `next start` page 200, /api/forge live Gemini (Frost → ice, 2.5 s stun, 1640 ms), `npm run test:gestures` ALL PASS. Links opened: ai.google.dev/edge/mediapipe 200, nextjs.org 200, github.com/cindyzli/jigglewiggle 200, phaser.io 403 (bot block) → replaced with github.com/phaserjs/phaser 200.
- devpost-autofiller: devpost-draft.md. Repository MISSING (no remote/commits), Demo BLOCKED (no deploy), Video MISSING (not recorded).
- final-report.md updated.
