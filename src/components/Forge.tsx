"use client";
import { useEffect, useRef, useState } from "react";
import { poseHub } from "@/lib/poseHub";
import { buildTemplate, matchRecent, MIN_CONFIDENCE, type GestureTemplate, type Sensitivity, type TimedFrame } from "@/lib/gesture/dtw";
import { EFFECT_STYLE, type AbilityConfig } from "@/lib/abilities";
import type { ForgedPower } from "@/lib/powers";
import { sfx } from "@/lib/sfx";

type Step = "intro" | "countdown" | "recording" | "between" | "review" | "describe" | "oracle" | "result";
type OracleResult = { source: "gemini" | "offline"; config: AbilityConfig; raw?: unknown; model?: string; ms?: number; reason?: string };
type Sample = { frames: TimedFrame[]; presetsSeen: string[] };

const SAMPLES = 3;
const RECORD_MS = 2400;
const EXAMPLES = [
  ["Thunderstrike", "Summon lightning and briefly stun enemies"],
  ["Athena's Mend", "A warm light that heals my wounds"],
  ["Poseidon's Wrath", "A huge wave that crashes into the Cyclops"],
];

export default function Forge({ onClose, onBind }: { onClose: () => void; onBind: (p: ForgedPower) => void }) {
  const [step, setStep] = useState<Step>("intro");
  const [count, setCount] = useState(3);
  const [progress, setProgress] = useState(0);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [warn, setWarn] = useState("");
  const [tpl, setTpl] = useState<GestureTemplate | null>(null);
  const [live, setLive] = useState(0);
  const [hits, setHits] = useState(0);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [oracle, setOracle] = useState<OracleResult | null>(null);
  const [sens, setSens] = useState<Sensitivity>("normal");
  const recRef = useRef<Sample | null>(null);

  useEffect(() => {
    poseHub.mode = "forge";
    return () => { poseHub.mode = "idle"; };
  }, []);

  // Collect frames while recording.
  useEffect(() => {
    return poseHub.subscribe((o, now) => {
      const rec = recRef.current;
      if (!rec || !o.features) return;
      rec.frames.push({ t: now, f: o.features });
      if (o.presets?.shield) rec.presetsSeen.push("Shield");
      if (o.presets?.blast) rec.presetsSeen.push("Blast");
      if (o.presets?.lean) rec.presetsSeen.push("Dodge");
    });
  }, []);

  // Live recognition test of the freshly built template.
  useEffect(() => {
    if (!tpl || (step !== "review" && step !== "describe")) return;
    const hist: TimedFrame[] = [];
    let streak = 0, coolUntil = 0, lastUi = 0;
    return poseHub.subscribe((o, now) => {
      if (!o.features) return;
      hist.push({ t: now, f: o.features });
      while (hist.length && hist[0].t < now - 4000) hist.shift();
      const { conf } = matchRecent(hist, tpl, now, sens);
      streak = conf >= MIN_CONFIDENCE ? streak + 1 : 0;
      if (streak >= 2 && now > coolUntil) {
        coolUntil = now + 1500; hist.length = 0; streak = 0;
        setHits((h) => h + 1); sfx.forge();
      }
      if (now - lastUi > 80) { lastUi = now; setLive(conf); }
    });
  }, [tpl, step, sens]);

  function recordNext(idx: number) {
    setStep("countdown"); setCount(3); setWarn("");
    let c = 3;
    const iv = setInterval(() => {
      c--; setCount(c);
      if (c > 0) { sfx.warn(); return; }
      clearInterval(iv);
      sfx.forge();
      recRef.current = { frames: [], presetsSeen: [] };
      setStep("recording");
      const t0 = performance.now();
      const piv = setInterval(() => {
        const k = (performance.now() - t0) / RECORD_MS;
        setProgress(Math.min(1, k));
        if (k < 1) return;
        clearInterval(piv);
        const s = recRef.current!;
        recRef.current = null;
        if (s.frames.length < 20) {
          setWarn("I couldn't see you clearly. Make sure your shoulders and hands are in view, then try this sample again.");
          setStep("between");
          return;
        }
        const next = [...samples.slice(0, idx), s];
        setSamples(next);
        if (next.length >= SAMPLES) finish(next);
        else setStep("between");
      }, 50);
    }, 700);
  }

  function finish(all: Sample[]) {
    const t = buildTemplate(all.map((s) => s.frames));
    setTpl(t);
    setHits(0);
    const seen = new Set(all.flatMap((s) => s.presetsSeen));
    setWarn(seen.size ? `Heads up: this move also looks like ${[...seen].join(" / ")}. It will still work; your power takes priority when it matches.` : "");
    setStep("review");
  }

  async function consult() {
    setStep("oracle");
    setOracle(null);
    const t0 = performance.now();
    try {
      const r = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(offlineOnly ? { "x-force-offline": "1" } : {}) },
        body: JSON.stringify({ name, description: desc }),
        signal: AbortSignal.timeout(20000),
      });
      const j = (await r.json()) as OracleResult;
      // Keep the oracle visible for a beat so judges can see the step happen.
      await new Promise((res) => setTimeout(res, Math.max(0, 900 - (performance.now() - t0))));
      setOracle(j);
    } catch {
      const { fallbackAbility } = await import("@/lib/abilities");
      setOracle({ source: "offline", reason: "Network error", config: fallbackAbility(name, desc) });
    }
    setStep("result");
  }

  function bind() {
    if (!tpl || !oracle) return;
    onBind({ id: `p${Date.now()}`, description: desc, config: oracle.config, source: oracle.source, template: tpl, sensitivity: sens, createdAt: Date.now() });
  }

  const quality = tpl ? qualityOf(tpl) : null;
  const cfg = oracle?.config;
  const style = cfg ? EFFECT_STYLE[cfg.effect] : null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#16100c]/85 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-md border-4 border-[#16100c] bg-[#f4e4c6] p-6 text-[#16100c] shadow-2xl">
        <div className="meander absolute inset-x-0 top-0 h-3" />
        <button onClick={onClose} className="absolute right-3 top-4 rounded px-2 text-sm font-bold hover:bg-black/10" aria-label="Close forge">✕</button>
        <p className="font-display text-xs font-bold tracking-[0.25em] text-[#9e4a1c]">THE FORGE · STEP {stepNo(step)} OF 3</p>
        <h2 className="font-display mt-1 text-2xl font-bold">Forge a Power</h2>

        {step === "intro" && (
          <div className="mt-3 space-y-3">
            <p>Odysseus did not out-muscle the Cyclops. He <em>invented</em> his way out. Invent a move of your own.</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Perform any upper-body movement <b>3 times</b> (2.4 s each). Seated is fine.</li>
              <li>Name it and describe the power in plain words.</li>
              <li>Gemini, the Oracle, turns your words into a game ability.</li>
            </ol>
            <p className="text-sm opacity-75">Tip: pick a move with its own big arm path, distinct from the presets (hands up, arms out, leaning): an arm circle, a punch across, a two-arm pump, crossing your arms. Moves that differ only by a small flick of the hand are easy to confuse.</p>
            <button onClick={() => recordNext(0)} className="btn-primary">Record sample 1</button>
          </div>
        )}

        {(step === "countdown" || step === "recording" || step === "between") && (
          <div className="mt-4">
            <div className="flex gap-2">
              {Array.from({ length: SAMPLES }, (_, i) => (
                <div key={i} className={`h-2 flex-1 rounded ${i < samples.length ? "bg-[#9e4a1c]" : "bg-black/15"}`} />
              ))}
            </div>
            {step === "countdown" && (
              <div className="py-8 text-center">
                <p className="text-sm">Sample {samples.length + 1} of {SAMPLES}. Get ready…</p>
                <p className="font-display text-7xl font-bold">{count}</p>
              </div>
            )}
            {step === "recording" && (
              <div className="py-8 text-center">
                <p className="font-display text-3xl font-bold text-[#b3321f]">PERFORM YOUR MOVE</p>
                <div className="mx-auto mt-4 h-3 w-2/3 overflow-hidden rounded bg-black/15">
                  <div className="h-full bg-[#b3321f]" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            )}
            {step === "between" && (
              <div className="py-6 text-center">
                {warn ? <p className="mb-3 text-sm text-[#b3321f]">{warn}</p> : <p className="mb-3">Sample {samples.length} captured ✓</p>}
                <button onClick={() => recordNext(samples.length)} className="btn-primary">
                  Record sample {Math.min(SAMPLES, samples.length + 1)}
                </button>
              </div>
            )}
          </div>
        )}

        {(step === "review" || step === "describe") && tpl && quality && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`rounded px-2 py-0.5 font-bold text-[#f4e4c6] ${quality.color}`}>Consistency: {quality.label}</span>
              <span className="rounded bg-black/10 px-2 py-0.5">{tpl.isStatic ? "Held pose" : `Movement · ${(tpl.durationMs / 1000).toFixed(1)} s`}</span>
              <span className="rounded bg-black/10 px-2 py-0.5">DTW tolerance {tpl.tolerance.toFixed(3)}</span>
            </div>
            {warn && <p className="text-sm text-[#9e4a1c]">{warn}</p>}
            <div>
              <p className="text-sm font-bold">Test it now: perform your move. Then sit still, shield, or blast: it should NOT fire.</p>
              <ConfBar conf={live} />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>Recognized <b>{hits}</b> time{hits === 1 ? "" : "s"}</p>
                <SensitivityPicker value={sens} onChange={setSens} />
              </div>
            </div>
            {step === "review" && (
              <div className="flex gap-2">
                <button onClick={() => setStep("describe")} className="btn-primary">Looks good → name it</button>
                <button onClick={() => { setSamples([]); setTpl(null); recordNext(0); }} className="btn-ghost">Re-record</button>
              </div>
            )}
            {step === "describe" && (
              <div className="space-y-2 border-t border-black/20 pt-3">
                <label className="block text-sm font-bold">Name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={28} placeholder="Thunderstrike" className="input" autoFocus />
                </label>
                <label className="block text-sm font-bold">What does it do? (plain words)
                  <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} rows={2} placeholder="Summon lightning and briefly stun enemies" className="input" />
                </label>
                <div className="flex flex-wrap gap-1 text-xs">
                  {EXAMPLES.map(([n, d]) => (
                    <button key={n} onClick={() => { setName(n); setDesc(d); }} className="rounded border border-black/30 px-2 py-0.5 hover:bg-black/10">{n}</button>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button disabled={!name.trim() || !desc.trim()} onClick={consult} className="btn-primary">Consult the Oracle (Gemini)</button>
                  <label className="flex items-center gap-1 text-xs opacity-70">
                    <input type="checkbox" checked={offlineOnly} onChange={(e) => setOfflineOnly(e.target.checked)} /> simulate Gemini offline
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "oracle" && (
          <div className="py-10 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#9e4a1c] border-t-transparent" />
            <p className="font-display mt-4 text-lg font-bold">The Oracle (Gemini) reads your words…</p>
            <p className="mt-1 text-sm opacity-75">&ldquo;{desc}&rdquo; → name · effect · damage · stun · cooldown</p>
          </div>
        )}

        {step === "result" && oracle && cfg && style && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {oracle.source === "gemini" ? (
                <span className="rounded bg-[#2f6b3a] px-2 py-0.5 font-bold text-white">✓ Gemini · {oracle.model} · {oracle.ms} ms</span>
              ) : (
                <span className="rounded bg-[#9e4a1c] px-2 py-0.5 font-bold text-white">Oracle silent: offline preset config</span>
              )}
              {oracle.reason && <span className="truncate text-xs opacity-60" title={oracle.reason}>{oracle.reason}</span>}
            </div>
            <div className="rounded border-2 border-[#16100c] bg-[#16100c] p-4 text-[#f4e4c6]">
              <p className="font-display text-2xl font-bold" style={{ color: style.css }}>{cfg.name}</p>
              <p className="italic opacity-90">{cfg.flavor}</p>
              <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
                <Stat k="Effect" v={style.label} />
                <Stat k="Damage" v={String(cfg.damage)} />
                <Stat k="Stun" v={`${cfg.stunSeconds}s`} />
                <Stat k="Heal" v={String(cfg.heal)} />
                <Stat k="Cooldown" v={`${cfg.cooldownSeconds}s`} />
              </div>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer opacity-70">Validated config JSON</summary>
              <pre className="mt-1 overflow-auto rounded bg-black/10 p-2">{JSON.stringify(cfg, null, 2)}</pre>
            </details>
            <div className="flex gap-2">
              <button onClick={bind} className="btn-primary">Bind power to my move</button>
              <button onClick={() => setStep("describe")} className="btn-ghost">Change words</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function stepNo(s: Step) { return s === "intro" || s === "countdown" || s === "recording" || s === "between" ? 1 : s === "review" || s === "describe" ? 2 : 3; }

function qualityOf(t: GestureTemplate) {
  const worst = Math.max(...t.selfDistances);
  const r = worst / t.tolerance;
  if (r < 0.6) return { label: "Strong", color: "bg-[#2f6b3a]" };
  if (r < 0.9) return { label: "Good", color: "bg-[#9e4a1c]" };
  return { label: "Loose: consider re-recording", color: "bg-[#b3321f]" };
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-[#f4e4c6]/30 p-1">
      <p className="opacity-60">{k}</p>
      <p className="text-base font-bold">{v}</p>
    </div>
  );
}

export function SensitivityPicker({ value, onChange, dark }: { value: Sensitivity; onChange: (s: Sensitivity) => void; dark?: boolean }) {
  return (
    <div className="flex items-center gap-1 text-xs" role="radiogroup" aria-label="Recognition sensitivity">
      <span className="opacity-70">Sensitivity</span>
      {(["strict", "normal", "loose"] as const).map((k) => (
        <button
          key={k}
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`rounded border px-1.5 py-0.5 ${value === k ? (dark ? "border-[#f4e4c6] bg-[#f4e4c6] text-[#16100c]" : "border-[#16100c] bg-[#16100c] text-[#f4e4c6]") : dark ? "border-[#f4e4c6]/40" : "border-black/30"}`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

export function ConfBar({ conf, small }: { conf: number; small?: boolean }) {
  return (
    <div className={`relative mt-1 overflow-hidden rounded bg-black/20 ${small ? "h-1.5" : "h-4"}`}>
      <div className={`h-full transition-[width] duration-75 ${conf >= MIN_CONFIDENCE ? "bg-[#2f6b3a]" : "bg-[#9e4a1c]"}`} style={{ width: `${Math.round(conf * 100)}%` }} />
      <div className="absolute inset-y-0 w-0.5 bg-[#16100c]" style={{ left: `${MIN_CONFIDENCE * 100}%` }} title="fire threshold" />
    </div>
  );
}
