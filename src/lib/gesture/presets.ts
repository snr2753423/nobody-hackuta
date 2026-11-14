// Rule-based detection of the three preset upper-body gestures. All work seated.
//   shield  : both hands raised above the shoulders
//   dodge   : lean left / right (shoulder tilt or sideways shift vs. a slowly-updated baseline)
//   blast   : both arms extended outward to the sides
// Each state needs a few consecutive frames to enter and to exit (hysteresis), so jitter cannot flicker it.
import type { Body } from "./features";

export type Lean = -1 | 0 | 1;
export type PresetState = {
  shield: boolean;
  lean: Lean;
  blast: boolean;
  metrics: { tiltDeg: number; shift: number; head: number; leanScore: number; reachL: number; reachR: number; liftL: number; liftR: number };
};

class Debounce {
  private on = false; private inN = 0; private outN = 0;
  constructor(private enter = 3, private exit = 4) {}
  update(raw: boolean): boolean {
    if (raw) { this.inN++; this.outN = 0; if (!this.on && this.inN >= this.enter) this.on = true; }
    else { this.outN++; this.inN = 0; if (this.on && this.outN >= this.exit) this.on = false; }
    return this.on;
  }
  reset() { this.on = false; this.inN = 0; this.outN = 0; }
}

export const PRESET_THRESHOLDS = {
  shieldLift: 0.55, // wrists this many shoulder-widths above their shoulder
  blastReach: 0.75, // wrists this many shoulder-widths outside their shoulder
  blastVertical: 0.9, // and within this vertical band of shoulder height
  blastStillness: 0.06,
  // Lean = absolute shoulder tilt + head offset from the shoulder midpoint (positive = left).
  // Both are ~0 when sitting upright, so no captured baseline is needed.
  leanTiltDeg: 8, // degrees of shoulder tilt worth one "unit" of lean
  leanHead: 0.3, // shoulder-widths of head offset (relative to shoulder midpoint) worth one unit
  leanEnter: 1.0,
  leanExit: 0.55,
};

export class PresetDetector {
  private shield = new Debounce(3, 4);
  private blast = new Debounce(3, 3);
  private lean: Lean = 0;
  private leanFrames = 0;
  // Small bias correction for camera roll / off-centre seating. Clamped so it can never invert a lean.
  private biasTilt = 0;
  private biasHead = 0;
  private lastBlastFire = -1e9;
  blastRepeatMs = 1100;

  recalibrate() { this.lean = 0; this.leanFrames = 0; }
  reset() { this.prevLift = null; this.shield.reset(); this.blast.reset(); this.recalibrate(); }

  /** Returns current state and whether a blast should fire this frame. */
  update(b: Body, tMs: number): { state: PresetState; fireBlast: boolean } {
    const T = PRESET_THRESHOLDS;
    const liftL = (b.lS.y - b.lW.y) / b.sw;
    const liftR = (b.rS.y - b.rW.y) / b.sw;
    const reachL = (b.lS.x - b.lW.x) / b.sw;
    const reachR = (b.rW.x - b.rS.x) / b.sw;
    const tiltDeg = (b.tilt * 180) / Math.PI;
    const head = (b.nose.x - b.center.x) / b.sw;
    const shift = 0;
    const leanScore = (tiltDeg - this.biasTilt) / T.leanTiltDeg - (head - this.biasHead) / T.leanHead; // + = left

    // Vertical wrist speed (shoulder-widths per frame): arms sweeping up to a shield pass through the
    // "arms out" region, so blast only counts once the arms are held out, not while swinging through.
    const vy = this.prevLift ? Math.max(Math.abs(liftL - this.prevLift[0]), Math.abs(liftR - this.prevLift[1])) : 0;
    this.prevLift = [liftL, liftR];
    const shieldRaw = liftL > T.shieldLift && liftR > T.shieldLift;
    const blastRaw = !shieldRaw && reachL > T.blastReach && reachR > T.blastReach && vy < T.blastStillness &&
      Math.abs(liftL) < T.blastVertical && Math.abs(liftR) < T.blastVertical;

    const shield = this.shield.update(shieldRaw);
    const wasBlast = this.blastOn;
    const blast = this.blast.update(blastRaw);
    this.blastOn = blast;
    // Lean with hysteresis: enter past leanEnter for 2 frames, leave below leanExit for 3 frames.
    const want: Lean = leanScore > T.leanEnter ? -1 : leanScore < -T.leanEnter ? 1 : 0;
    if (this.lean === 0) {
      this.leanFrames = want !== 0 ? this.leanFrames + 1 : 0;
      if (this.leanFrames >= 2) { this.lean = want; this.leanFrames = 0; }
    } else {
      const holding = this.lean === -1 ? leanScore > T.leanExit : leanScore < -T.leanExit;
      this.leanFrames = holding ? 0 : this.leanFrames + 1;
      if (this.leanFrames >= 3) { this.lean = 0; this.leanFrames = 0; }
    }
    const lean = this.lean;

    // Very slowly learn a small bias while sitting near upright (camera roll, sitting off-centre).
    if (lean === 0 && Math.abs(leanScore) < 0.6) {
      const a = 0.003;
      this.biasTilt = Math.max(-4, Math.min(4, this.biasTilt + a * (tiltDeg - this.biasTilt)));
      this.biasHead = Math.max(-0.1, Math.min(0.1, this.biasHead + a * (head - this.biasHead)));
    }

    let fireBlast = false;
    if (blast && (!wasBlast || tMs - this.lastBlastFire >= this.blastRepeatMs)) {
      fireBlast = true;
      this.lastBlastFire = tMs;
    }
    return { state: { shield, lean, blast, metrics: { tiltDeg, shift, head, leanScore, reachL, reachR, liftL, liftR } }, fireBlast };
  }
  private blastOn = false;
  private prevLift: [number, number] | null = null;
}
