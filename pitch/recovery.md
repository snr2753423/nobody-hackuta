# Recovery lines

One line per failure. Say it, point, move on.

- **Page doesn't load / blank:** "Server hiccup, ten seconds." Run `npm run start` in the open terminal, reload. Meanwhile point at the README's architecture section.
- **Camera denied / no skeleton:** "The browser blocked the camera, so I'll play on the keyboard backup." Use arrows to lean, ↑ to shield, space to blast, 1 for the power. "Same game logic; the gestures feed these exact inputs." Then click the camera icon in the address bar → Allow → reload.
- **Skeleton visible but "step into view":** "It needs your shoulders and hands in frame. Lean back a little." Point at the tracking badge turning to ● tracking.
- **A gesture doesn't register:** "Press D and you can see the raw numbers it's reading." Point at the lean score or lift/reach vs. thresholds. Then fall back to the key for that action.
- **Forged move won't fire:** "Let's use the one I forged earlier." Use the backup power, or set its sensitivity to *loose* in the sidebar. As a last resort, press 1.
- **Forged move fires too often:** set that power to *strict* in the sidebar. "Each power has its own sensitivity."
- **Gemini call fails or is slow:** "That's the fallback you're seeing." The badge reads "Oracle silent: offline preset config". "The game never depends on the API; the offline oracle maps your words to the same allowlist."
- **Nothing happens when clicking (Forge open behind?):** close the Forge (✕). The fight is paused while the Forge is open. That's intended.
- **Judge loses:** "Polyphemus ate Nobody last. That's the lose state." Click *Try again*: "restart is instant."
- **Wi-Fi down:** "Everything except Gemini runs on device. The pose model is served from this laptop." Continue. The Forge uses the offline oracle automatically.
