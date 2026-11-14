"use client";
import { useEffect, useRef } from "react";

/** Mounts the Phaser game. Remount (change `key`) to restart cleanly. */
export default function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let game: import("phaser").Game | null = null;
    let cancelled = false;
    (async () => {
      const Phaser = (await import("phaser")).default;
      const { FightScene, W, H } = await import("@/game/FightScene");
      if (cancelled || !host.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
        width: W,
        height: H,
        backgroundColor: "#d2733a",
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [FightScene],
        audio: { noAudio: true },
        banner: false,
        // ?selftest: drive the loop with timers so automated checks also run in a background tab.
        ...(new URLSearchParams(window.location.search).has("selftest") ? { fps: { forceSetTimeOut: true, target: 60 } } : {}),
      });
      (window as unknown as { __nobodyGame?: unknown }).__nobodyGame = game; // debug handle
    })();
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);
  return <div ref={host} className="absolute inset-0" />;
}
