# Pitch script: 3 minutes

HackUTA judging is 3 minutes of presentation plus 2 minutes of Q&A, so this is timed to 3:00, not 4.
Roughly 330 spoken words at about 140 words per minute is about 2:20 of talking; the demo pauses fill the rest.
**[DEMO]** marks moments where you stop talking and let the screen work.

Setup before the judge arrives:
- `npm run start` (or `npm run dev`) is running.
- The page is open in Chrome at localhost:3000, with camera allowed.
- A backup power is already forged.
- The judge sits in your chair, about an arm's length from the laptop.

---

**0:00–0:20 · Hook** *(title screen visible, judge's skeleton glowing on the right)*
> "In the Odyssey, Odysseus escapes the Cyclops not by strength but by a lie: he says his name is *Nobody*. This game is that escape, and you're the controller. That glowing skeleton is you, tracked right here in the browser."

**0:20–0:35 · Name the lie**
**[DEMO]** The judge clicks *Enter the cave*, then *Continue*. Polyphemus asks their name; the only answer is "My name is… **Nobody**." The judge clicks it.
> "That's the deception, and it pays off later in the fight."

**0:35–1:05 · Three body controls**
> "Hands up raises your shield against his club. Lean to dodge the boulder. Arms out fires a blast."

**[DEMO]** The judge fights. Point at the red ring ("lean!") and the club ("hands up!"). The chips under the game light up with each gesture.

**1:05–1:20 · The Nobody beat** *(boss bar hits the halfway notch)*
**[DEMO]** Stop talking. Polyphemus screams "NOBODY IS HURTING ME!" Three Cyclopes appear at the door, laugh, and leave: *"Reinforcements cancelled: no one comes for Nobody."*
> "The lie you told at the start is why his brothers walk away. That's Book Nine, playing out in the fight."

**1:20–2:15 · Forge a Power** *(the centerpiece)*
> "Now the real trick. Odysseus invents, so you invent. Click Forge a Power."

**[DEMO]** The judge does any move 3 times (suggest the thunderbolt throw), then performs it once in *Test it* and watches the confidence bar cross the threshold.
> "No training. We turn each sample into joint angles and body-relative trajectories, average the three with dynamic time warping, and match live against that template."

**[DEMO]** The judge picks a name and description (or clicks *Thunderstrike*), then *Consult the Oracle*. The Gemini badge shows the model and milliseconds, plus the config card: effect, damage, stun, cooldown.
> "Gemini has exactly one job: turn your words into a game ability, chosen from an allowlist and clamped for balance. If it's offline, an offline oracle takes over. Watch." *(Optional: tick 'simulate Gemini offline' and show the fallback badge.)*

If short on time, skip the live forge: "I forged this one earlier." Use the backup power.

**2:15–2:45 · Use it and win**
**[DEMO]** The judge performs their move. The power fires with lightning and a stun. They finish Polyphemus: the olive stake, "NOBODY HAS BLINDED ME!", and the escape-under-the-rams card.
> "Your invented move, recognized from your body, casting an ability Gemini wrote from your words."

**2:45–3:00 · Close + cuts**
> "One trial, polished instead of three half-built. Everything runs on device: MediaPipe, Phaser, no backend except the one Gemini call. We cut the Sirens and Scylla on purpose; robustness first. Questions?"
