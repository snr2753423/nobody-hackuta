// Gesture engine: landmarks in, game inputs out. Runs once per camera frame.
import { featuresOf, LandmarkSmoother, toBody, type Body, type Landmark } from "./features";
import { PresetDetector, type PresetState } from "./presets";
import { matchRecent, MIN_CONFIDENCE, type TimedFrame } from "./dtw";
import type { ForgedPower } from "../powers";

export type PowerReading = { id: string; conf: number; ready: boolean };
export type EngineOutput = {
  body: Body | null;
  smoothed: Landmark[] | null;
  features: number[] | null;
  presets: PresetState | null;
  fireBlast: boolean;
  firedPower: { power: ForgedPower; conf: number } | null;
  powers: PowerReading[];
};

const HISTORY_MS = 4000;

export class GestureEngine {
  private smoother = new LandmarkSmoother(0.55);
  readonly presets = new PresetDetector();
  private history: TimedFrame[] = [];
  private powers: ForgedPower[] = [];
  private cooldownUntil = new Map<string, number>();
  private streak = new Map<string, number>();
  private ignoreBefore = 0;
  private lastCustomFire = -1e9;
  enabled = { presets: true, powers: true };

  setPowers(p: ForgedPower[]) { this.powers = p; }
  /** Drop recent movement (e.g. after a fire or when the Forge closes) so it cannot re-trigger. */
  clearHistory(now: number) { this.history = []; this.ignoreBefore = now; this.streak.clear(); }
  cooldownLeft(id: string, now: number) { return Math.max(0, (this.cooldownUntil.get(id) ?? 0) - now); }

  process(raw: Landmark[] | null, aspect: number, now: number): EngineOutput {
    const empty: EngineOutput = { body: null, smoothed: null, features: null, presets: null, fireBlast: false, firedPower: null, powers: [] };
    if (!raw) { this.smoother.reset(); return empty; }
    const smoothed = this.smoother.push(raw);
    const body = toBody(smoothed, aspect);
    if (!body || !body.visible.shoulders) return { ...empty, smoothed };
    const features = featuresOf(body);
    this.history.push({ t: now, f: features });
    while (this.history.length && this.history[0].t < now - HISTORY_MS) this.history.shift();

    const { state, fireBlast } = this.presets.update(body, now);

    const readings: PowerReading[] = [];
    let fired: EngineOutput["firedPower"] = null;
    if (this.enabled.powers) {
      const hist = this.history.filter((h) => h.t >= this.ignoreBefore);
      for (const p of this.powers) {
        const { conf } = matchRecent(hist, p.template, now, p.sensitivity ?? "normal");
        const ready = now >= (this.cooldownUntil.get(p.id) ?? 0);
        readings.push({ id: p.id, conf, ready });
        const s = conf >= MIN_CONFIDENCE ? (this.streak.get(p.id) ?? 0) + 1 : 0;
        this.streak.set(p.id, s);
        if (ready && s >= 2 && !fired) fired = { power: p, conf };
      }
      if (fired) {
        this.cooldownUntil.set(fired.power.id, now + Math.max(1.5, fired.power.config.cooldownSeconds) * 1000);
        this.lastCustomFire = now;
        this.clearHistory(now);
      }
    }
    // A custom power that just fired takes priority over a preset blast from the same motion.
    const blast = this.enabled.presets && fireBlast && now - this.lastCustomFire > 700;
    return { body, smoothed, features, presets: state, fireBlast: blast, firedPower: fired, powers: readings };
  }
}
