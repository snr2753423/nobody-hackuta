# Devpost draft

Every field below is copied from README.md and docs/final-report.md. Paste each section into the matching Devpost field.

## Title
NOBODY: Escape Polyphemus

## Tagline
Escape the Cyclops with your body, and forge your own powers: do any move 3 times, describe it, and it becomes an ability.

(The tagline is 122 characters.)

## Description

### Inspiration
In Book 9 of Homer's *Odyssey*, Odysseus is trapped in the cave of Polyphemus, a one-eyed giant who eats his men two at a time. He can't win by strength: the boulder sealing the door is too heavy for any mortal. He wins by inventing. He tells the Cyclops his name is "Nobody", so when the blinded giant screams "Nobody is hurting me!", his brothers shrug and leave. We wanted a game where the player survives the same way, by inventing the move nobody expected. Webcam-controlled play was inspired by Jiggle Wiggle (TreeHacks 2026), but none of its code or assets were used.

### What it does
- **Your body is the controller, seated.** Raise both hands to block the club slam. Lean left or right to escape the boulder. Hold both arms out to fire a blast.
- **Forge a Power.** Perform any upper-body movement three times, name it, and describe it in plain words, for example "Thunderstrike: summon lightning and briefly stun enemies". Gemini turns your words into a game ability, and from then on performing that movement casts it in combat. No model training.
- **The Nobody story is in the game, not just the title:**
  - Polyphemus asks your name. You choose: lie ("Nobody") or tell the truth ("Odysseus").
  - At half health he cries "NOBODY IS HURTING ME!" Three Cyclopes appear at the cave mouth, laugh, and leave: "Reinforcements cancelled: no one comes for Nobody."
  - Tell the truth instead and he cries "ODYSSEUS IS HURTING ME!" His brothers stay and throw boulders with him, so two lanes are deadly on every throw. The end card points you back to Homer's lie.
  - You finish him with the olive stake ("NOBODY HAS BLINDED ME!") and escape beneath the rams.
- **Win, lose, and restart:** boss and player health, score shown as κλέος (glory), and an instant restart.

### How we built it
- **Pose:** MediaPipe Pose Landmarker runs in the browser, on device. We self-host the model and WASM, so the game never depends on venue Wi-Fi for tracking.
- **Features:** each frame becomes 14 numbers. They're joint angles plus wrist and elbow positions relative to the shoulder midpoint, scaled by shoulder width. No raw pixels.
- **Presets:** rule-based detectors with hysteresis.
- **Forge:** we trim the idle start and end of each sample, resample it, and merge the three into one template with DTW barycenter averaging. The match tolerance comes from how consistent the three samples were.
- **Live recognition:** dynamic time warping with five extra gates: enough motion, the same direction (so returning to rest doesn't fire), a similar path length, a rhythm check (direction reversals in the most-varying joints, so a wave isn't a plain arm raise), and per-feature weights. Each power has a cooldown and its own sensitivity setting.
- **Gemini has exactly one job.** One server route turns the description into `{name, effect, damage, stunSeconds, cooldownSeconds, heal, flavor}`:
  - The effect comes from an 8-item allowlist.
  - The server clamps every number for balance.
  - It's called once per Forge, never per frame.
  - If Gemini is unavailable, an offline keyword oracle takes over, and the Forge shows which oracle answered.
- **Game:** Phaser 3, drawn entirely in code in Greek black-figure vase style. Sound is synthesized with WebAudio.
- **Testing:** a synthetic-skeleton harness generates noisy upper-body movements to test recognition and false fires without a camera.

### Challenges we ran into
- **Live tests broke what synthetic tests passed.** Round one: dodge was unreliable, because the "neutral posture" baseline slowly absorbed a natural lean. Round two: dodge was inverted, because the baseline was captured while the player was still reaching for the trackpad. We replaced it with a calibration-free lean score: absolute shoulder tilt plus head offset.
- **Forged powers also fired on the return-to-rest motion.** Our DTW distance was normalized by warping-path length, so a reversed movement could score well. We switched to sequence-length normalization and added a direction check.
- **Idle trimming silently failed under real webcam jitter,** which made templates loose. We made the threshold noise-aware.

### Accomplishments that we're proud of
- **Recognition from three examples, with no training.** In our synthetic harness, all 8 test moves are recognized 6/6, and none fires on any distinct movement, including the presets and reverse motions.
- **The game never needs the API to be playable.** We verified the no-key path in a production build.
- **One trial, polished end to end,** with the Odyssey's central trick playing out inside the fight.

### What we learned
Synthetic data proves the logic, but only a real body in front of a real camera finds the bugs that matter. Two of the three live rounds found real problems.

### What's next
- **More live testing:** recognition has only been tested live on one person so far.
- **Run first-time-player tests and deploy publicly.**
- **Build the next trial:** the Sirens, where you must *not* move toward the song.

## Built With
- next.js
- react
- typescript
- tailwind-css
- mediapipe
- phaser
- google-gemini
- webaudio
- dynamic-time-warping

## Links
- **Repository:** https://github.com/snr2753423/nobody-hackuta (public; verified it loads logged out, at commit 7cc0249)
- **Demo:** BLOCKED. Deploying to Vercel needs a login that isn't on this machine (no Vercel CLI or session). The demo runs on localhost, judged in person.
- **Video:** MISSING. Record it following `docs/demo-script.md`, watch it all the way through, then upload it (YouTube, unlisted).
