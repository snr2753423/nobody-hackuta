# Judge Q&A

## What breaks first?
**Live recognition on bodies we haven't tested.** Our false-fire numbers come from a synthetic harness: 8 forged moves against 18 performed movements, zero cross-fires on distinct moves. Live, only one person has tested it.

The hardest synthetic case was a "wave overhead" firing on a plain "raise arm overhead": 4 of 6 trials, before we added a rhythm check that counts direction reversals in the joints that vary most. It's now 0 of 6.

If a real body behaves differently, each power has a strict/normal/loose sensitivity setting.

**After that, lighting and framing.** MediaPipe needs your shoulders and hands in view. The camera badge says "step into view" when it can't see you, and keyboard controls back everything up.

## Who is this for, specifically?
- **Today:** HackUTA judges. They have to understand it and finish it seated in about 90 seconds, so all controls are upper-body.
- **Beyond today:** anyone who wants a body-controlled game without a special controller, using just a laptop webcam. Custom gestures also mean a player can choose movements that fit their own range of motion.

That's a design property we can point to, not something we've tested with users.

## What did you cut, and why?
- The Sirens and Scylla and Charybdis trials, accounts, leaderboards, multiplayer, 3D, and other sponsor integrations.
- Robustness is a scored criterion, so we polished one trial end to end rather than ship three fragile ones.
- The blinding and ram escape appear as story beats and cards, not as separate playable phases.

## Why this stack?
- **MediaPipe Pose:** runs on device in the browser at webcam frame rate, so it needs no server and no video ever leaves the laptop. We self-host the model and WASM so venue Wi-Fi can't break it.
- **Phaser 3 over 3D:** reliability.
- **DTW over a neural network:** three samples are nowhere near enough to train a model, while DTW works from exactly three examples. It recognizes instantly, with no retraining.
- **Next.js:** gives us one tiny server route, so the Gemini key never reaches the browser.

## What would you do with another week?
- Let the player record a "this is NOT my move" sample, to tune their power's boundary.
- Run first-time-player tests to tune difficulty.
- Deploy publicly.
- Build the next trial (the Sirens, where you must *not* move toward the song).

## What did you learn that surprised you?
Our first DTW matcher normalized distance by warping-path length. On a real camera, that made the *return* motion fire the power. Reversing a movement could still score as a match because the path hugged the cheap middle frames.

Synthetic tests with clean data never showed it; the live test did. We switched to sequence-length normalization plus a direction check. In the synthetic harness, those reverse cases now fire 0 of 6. Live, the developer's retest after the fix worked; it hasn't been measured beyond that.

The lean detector taught a similar lesson. A "neutral posture" baseline was being captured while the player was still reaching for the trackpad.

## Is Gemini doing the gesture recognition?
No.
- **Gemini's role:** only translating the plain-words description into a structured config, once per Forge, picking an effect from an 8-item allowlist. The server clamps every number.
- **Recognition:** all local DTW.
- **Without Gemini:** an offline keyword oracle produces a valid config. We tested this with the key removed.

## How do you know it doesn't false-fire?
- **Synthetic harness** (`npm run test:gestures`): generates noisy upper-body skeletons for 18 movements, including the 3 presets, idle fidgeting, near misses, and reverse motions. It checks every forged template against every movement.
- **Gates:** a power needs ≥50% confidence on 2 consecutive frames. The movement also has to be big enough, go the same direction, and cover a similar total path.
- **Live:** one person (the developer) tested on the real camera over three rounds. Rounds 1 and 2 found real bugs (unreliable then inverted dodge, over-firing, return motion firing), and round 3 worked after the fixes. That's a small live sample, and we say so.

## Hostile pass (grill-judge): the three hardest questions

### "Is the Nobody beat a mechanic or a cutscene? Could I have lost those reinforcements?"
**It's a real choice now.** The intro offers both answers.
- **Say "Nobody":** at 50% HP his brothers come, laugh at "Nobody is hurting me", and leave. You get +500 Trickster.
- **Say "Odysseus":** they stay at the cave mouth and throw boulders with him. Every boulder attack then covers two lanes, leaving one safe lane. The end card points you back to Homer's lie, and a "Try again as Nobody" button follows.

Both paths are verified end to end in the browser.

### "Who besides you has forged a move live, and did it work the first time?"
Honest answer: **only the developer.** It took three live rounds; the first two exposed bugs we fixed (dodge baseline, reverse-motion matching). We haven't run a first-time-player test yet; it's on our list before judging.

The heavy testing is a synthetic harness with noisy skeletons. That's strong evidence for the matcher's logic, weaker evidence for real bodies and lighting.

### "Can I win without forging anything?"
**Yes.** Blast, shield, and dodge alone beat Polyphemus. The forged power is a bonus: more damage, a stun, or healing. It isn't required, which keeps the 90-second path safe for any judge.

We say "you *can* invent your own controls", not "you must".
