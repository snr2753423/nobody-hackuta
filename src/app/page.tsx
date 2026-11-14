"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { bus, keyState, type GameResult } from "@/lib/bus";
import { poseHub } from "@/lib/poseHub";
import { loadPowers, savePowers, MAX_POWERS, type ForgedPower } from "@/lib/powers";
import { BACKUP_ABILITY, EFFECT_STYLE } from "@/lib/abilities";
import { MIN_CONFIDENCE } from "@/lib/gesture/dtw";
import { sfx, unlockAudio } from "@/lib/sfx";
import { ConfBar, SensitivityPicker } from "@/components/Forge";
import type { Sensitivity } from "@/lib/gesture/dtw";
import type { CamStatus } from "@/components/CameraPanel";

const CameraPanel = dynamic(() => import("@/components/CameraPanel"), { ssr: false });
const GameCanvas = dynamic(() => import("@/components/GameCanvas"), { ssr: false });
const Forge = dynamic(() => import("@/components/Forge"), { ssr: false });

type Phase = "title" | "intro" | "fight" | "over";

const INTRO = [
  {
    who: "THE CAVE",
    text: "Sailing home from Troy, Odysseus and his men shelter in a cave of cheeses and fat sheep. Its owner returns at dusk: Polyphemus, one-eyed son of Poseidon. He seals the door with a boulder no mortal can move.",
  },
  { who: "POLYPHEMUS", text: "Stranger! Give me your name, and I will give you a guest-gift. What is your name?", ask: true },
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("title");
  const [introStep, setIntroStep] = useState(0);
  const [runId, setRunId] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [powers, setPowers] = useState<ForgedPower[]>([]);
  const [cam, setCam] = useState<CamStatus>("starting");
  const [hud, setHud] = useState({ shield: false, lean: 0, blast: false, tracking: false, conf: {} as Record<string, number>, ready: {} as Record<string, boolean> });
  const [flash, setFlash] = useState<string | null>(null);

  // load saved powers
  useEffect(() => {
    const p = loadPowers();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; read after hydration
    setPowers(p);
    poseHub.engine.setPowers(p);
  }, []);

  // route gestures into the game only while fighting with no modal open
  useEffect(() => {
    const fighting = phase === "fight" && !forgeOpen;
    poseHub.mode = forgeOpen ? "forge" : fighting ? "fight" : "idle";
    bus.emit({ type: "pause", paused: phase === "fight" && forgeOpen });
    if (fighting) { poseHub.engine.clearHistory(performance.now()); poseHub.engine.presets.recalibrate(); }
  }, [phase, forgeOpen]);

  // game -> UI events
  useEffect(() => bus.on((e) => {
    if (e.type === "over") { setResult(e.result); setPhase("over"); }
    if (e.type === "power") { setFlash(e.config.name); setTimeout(() => setFlash(null), 900); }
  }), []);

  // gesture HUD (throttled)
  useEffect(() => {
    let last = 0;
    return poseHub.subscribe((o, now) => {
      if (now - last < 66) return;
      last = now;
      const conf: Record<string, number> = {}, ready: Record<string, boolean> = {};
      o.powers.forEach((p) => { conf[p.id] = p.conf; ready[p.id] = p.ready; });
      setHud({ shield: !!o.presets?.shield, lean: o.presets?.lean ?? 0, blast: !!o.presets?.blast, tracking: !!o.body, conf, ready });
    });
  }, []);

  const castByIndex = useCallback((i: number) => {
    const p = powers[i];
    const config = p?.config ?? (i === 0 ? BACKUP_ABILITY : null);
    if (config) bus.emit({ type: "power", id: p?.id ?? "backup", config, conf: 1 });
  }, [powers]);

  // keyboard backup controls
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.repeat) return;
      if (e.key === "ArrowLeft") keyState.lean = -1;
      else if (e.key === "ArrowRight") keyState.lean = 1;
      else if (e.key === "ArrowUp" || e.key === "s") keyState.shield = true;
      else if (e.key === " " && phase === "fight") { e.preventDefault(); bus.emit({ type: "blast" }); }
      else if (["1", "2", "3"].includes(e.key) && phase === "fight" && !forgeOpen) castByIndex(Number(e.key) - 1);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && keyState.lean === -1) keyState.lean = 0;
      if (e.key === "ArrowRight" && keyState.lean === 1) keyState.lean = 0;
      if (e.key === "ArrowUp" || e.key === "s") keyState.shield = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [phase, forgeOpen, castByIndex]);

  function begin() { unlockAudio(); setIntroStep(0); setPhase("intro"); }
  function startFight() { setResult(null); setRunId((r) => r + 1); setPhase("fight"); }
  function bindPower(p: ForgedPower) {
    const next = [p, ...powers].slice(0, MAX_POWERS);
    setPowers(next); savePowers(next); poseHub.engine.setPowers(next);
    poseHub.engine.clearHistory(performance.now());
    sfx.power();
    setForgeOpen(false);
  }
  function setSensitivity(id: string, sensitivity: Sensitivity) {
    const next = powers.map((p) => (p.id === id ? { ...p, sensitivity } : p));
    setPowers(next); savePowers(next); poseHub.engine.setPowers(next);
  }
  function removePower(id: string) {
    const next = powers.filter((p) => p.id !== id);
    setPowers(next); savePowers(next); poseHub.engine.setPowers(next);
  }

  return (
    <main className="min-h-screen bg-[#1d130d] p-3 text-[#f4e4c6] lg:p-4">
      <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[1fr_380px]">
        {/* ---------- stage ---------- */}
        <section className="min-w-0">
          <div className="relative aspect-video w-full overflow-hidden rounded-md border-4 border-[#16100c] bg-[#d2733a] shadow-2xl">
            {(phase === "fight" || phase === "over") && <GameCanvas key={runId} />}

            {phase === "title" && (
              <div className="vase absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-[#16100c]">
                <p className="font-display text-sm font-bold tracking-[0.4em] text-[#5a2a0e]">HOMER · ODYSSEY · BOOK IX</p>
                <h1 className="font-display mt-2 text-6xl font-black tracking-[0.15em] md:text-8xl">NOBODY</h1>
                <p className="mt-3 max-w-xl text-lg">Trapped in the Cyclops&apos;s cave, Odysseus survives by invention. So will you: your body is the controller, and you can <b>invent your own powers</b>.</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button onClick={begin} className="btn-dark text-lg">Enter the cave</button>
                  <button onClick={() => { unlockAudio(); setForgeOpen(true); }} className="btn-ghost-dark text-lg">⚒ Forge a Power</button>
                </div>
                <p className="mt-4 text-sm opacity-80">{cam === "ready" ? (hud.tracking ? "✓ Camera on · upper body visible" : "Camera on · sit back so your shoulders and hands are visible") : cam === "no-camera" || cam === "error" ? "Camera unavailable: keyboard controls still work" : "Starting camera…"}</p>
              </div>
            )}

            {phase === "intro" && (
              <div className="vase absolute inset-0 flex items-center justify-center p-6 text-[#16100c]">
                <div className="max-w-2xl rounded-md border-4 border-[#16100c] bg-[#f4e4c6] p-6 shadow-xl">
                  <p className="font-display text-xs font-bold tracking-[0.3em] text-[#9e4a1c]">{INTRO[introStep].who}</p>
                  <p className="mt-2 font-serif text-xl leading-relaxed">{INTRO[introStep].text}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {INTRO[introStep].ask ? (
                      <>
                        <button onClick={startFight} className="btn-dark">&ldquo;My name is… <b>Nobody</b>.&rdquo;</button>
                        <span className="self-center text-sm italic opacity-70">The lie that will save you.</span>
                      </>
                    ) : (
                      <button onClick={() => setIntroStep(1)} className="btn-dark">Continue →</button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {phase === "over" && result && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#16100c]/75 p-6">
                <div className="max-w-2xl rounded-md border-4 border-[#16100c] bg-[#f4e4c6] p-6 text-center text-[#16100c] shadow-2xl">
                  <p className="font-display text-xs font-bold tracking-[0.3em] text-[#9e4a1c]">{result.won ? "VICTORY" : "DEFEAT"}</p>
                  <h2 className="font-display mt-1 text-4xl font-black">{result.won ? "Nobody escaped." : "Polyphemus ate Nobody last."}</h2>
                  <p className="mt-3 font-serif text-lg leading-relaxed">
                    {result.won
                      ? "Blinded, the Cyclops rolls back the door-stone and feels the backs of his sheep as they pass. He never thinks to feel beneath them, where Odysseus's men cling to the bellies of the rams. Out at sea, Odysseus shouts his true name, and Poseidon's long curse begins."
                      : "No one came to save you. Nobody ever does. But the cave remembers a trick or two. Try again, or forge a stronger power."}
                  </p>
                  <p className="font-display mt-4 text-2xl font-bold">κλέος (glory): {result.score}</p>
                  <p className="text-sm opacity-70">time {(result.timeMs / 1000).toFixed(0)} s</p>
                  <div className="mt-5 flex justify-center gap-3">
                    <button onClick={startFight} className="btn-dark">{result.won ? "Play again" : "Try again"}</button>
                    <button onClick={() => setForgeOpen(true)} className="btn-ghost-dark">⚒ Forge a Power</button>
                  </div>
                </div>
              </div>
            )}

            {flash && (
              <div className="pointer-events-none absolute right-3 top-14 z-10 rounded bg-[#16100c]/85 px-3 py-1 font-display text-sm font-bold">
                ⚒ {flash} recognized
              </div>
            )}

            {forgeOpen && <Forge onClose={() => setForgeOpen(false)} onBind={bindPower} />}
          </div>

          {/* ---------- control legend ---------- */}
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Chip on={hud.shield} title="SHIELD" how="Both hands up" keys="↑" detail="Blocks the club slam" />
            <Chip on={hud.lean !== 0} title={hud.lean < 0 ? "DODGE ←" : hud.lean > 0 ? "DODGE →" : "DODGE"} how="Lean left / right" keys="← →" detail="Escape the boulder" />
            <Chip on={hud.blast} title="BLAST" how="Both arms out" keys="space" detail="Hits Polyphemus" />
            <div className={`rounded-md border-2 border-[#16100c] p-2 ${powers.length ? "bg-[#2a1c13]" : "bg-[#2a1c13]/60"}`}>
              <p className="font-display text-sm font-bold">FORGED POWERS</p>
              {powers.length === 0 ? (
                <p className="text-xs opacity-70">None yet. Forge one, or press 1 for the backup power.</p>
              ) : (
                powers.map((p, i) => (
                  <div key={p.id} className="mt-1">
                    <p className="flex justify-between text-xs">
                      <span style={{ color: EFFECT_STYLE[p.config.effect].css }} className="font-bold">{p.config.name}</span>
                      <span className="opacity-60">{hud.ready[p.id] === false ? "recharging" : `key ${i + 1}`}</span>
                    </p>
                    <ConfBar conf={hud.conf[p.id] ?? 0} small />
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ---------- camera + forge ---------- */}
        <aside className="space-y-3">
          <CameraPanel onStatus={(s) => setCam(s)} />
          <button
            onClick={() => { unlockAudio(); setForgeOpen(true); }}
            disabled={forgeOpen}
            className="w-full rounded-md border-2 border-[#16100c] bg-[#d2733a] py-3 font-display text-xl font-black text-[#16100c] shadow hover:bg-[#ec9d5f] disabled:opacity-50"
          >
            ⚒ FORGE A POWER
          </button>
          <div className="rounded-md border-2 border-[#16100c] bg-[#2a1c13] p-3 text-sm">
            <p className="font-display font-bold">Your powers ({powers.length}/{MAX_POWERS})</p>
            {powers.length === 0 && <p className="mt-1 text-xs opacity-70">Perform any move 3 times, describe it, and Gemini turns it into an ability.</p>}
            <ul className="mt-1 space-y-2">
              {powers.map((p) => (
                <li key={p.id} className="rounded bg-black/25 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold" style={{ color: EFFECT_STYLE[p.config.effect].css }}>{p.config.name}</p>
                      <p className="text-xs opacity-75">{EFFECT_STYLE[p.config.effect].label} · {p.config.damage} dmg{p.config.stunSeconds ? ` · stun ${p.config.stunSeconds}s` : ""}{p.config.heal ? ` · heal ${p.config.heal}` : ""} · {p.config.cooldownSeconds}s cd</p>
                      <p className="text-[10px] opacity-50">{p.source === "gemini" ? "config by Gemini" : "offline config"} · {p.template.isStatic ? "pose" : "movement"}</p>
                      <div className="mt-1"><SensitivityPicker dark value={p.sensitivity ?? "normal"} onChange={(s) => setSensitivity(p.id, s)} /></div>
                    </div>
                    <button onClick={() => removePower(p.id)} className="text-xs opacity-60 hover:opacity-100" aria-label={`Delete ${p.config.name}`}>✕</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] leading-snug opacity-50">
            On-device pose tracking (MediaPipe) · gestures matched by dynamic time warping, no training · keyboard backup: ← → lean, ↑ shield, space blast, 1–3 powers. Fire threshold {MIN_CONFIDENCE * 100}% confidence.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Chip({ on, title, how, keys, detail }: { on: boolean; title: string; how: string; keys: string; detail: string }) {
  return (
    <div className={`rounded-md border-2 border-[#16100c] p-2 transition-colors ${on ? "bg-[#fff27a] text-[#16100c]" : "bg-[#2a1c13]"}`}>
      <p className="font-display text-sm font-bold">{title}</p>
      <p className="text-xs">{how}</p>
      <p className="text-[10px] opacity-60">{detail} · key {keys}</p>
    </div>
  );
}
