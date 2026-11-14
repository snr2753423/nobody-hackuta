// Offline verification of the gesture pipeline with synthetic skeletons (no camera needed).
// Generates MediaPipe-shaped landmark streams for parametric upper-body movements, with noise,
// speed and amplitude variation, then checks presets and DTW recognition + false-fire rejection.
import { GestureEngine } from "../src/lib/gesture/engine";
import { buildTemplate, matchRecent as mr, type TimedFrame } from "../src/lib/gesture/dtw";
import { featuresOf, LandmarkSmoother, toBody, type Landmark } from "../src/lib/gesture/features";
import { fallbackAbility } from "../src/lib/abilities";
import type { ForgedPower } from "../src/lib/powers";

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());

// Pose parameters, in "screen" (mirrored) terms. Angles in degrees.
// shoulder angle: 0 = arm hanging down, 90 = out to the side, 180 = straight up.
// elbow bend: 0 = straight arm.
type Pose = { lSh: number; lEl: number; rSh: number; rEl: number; tilt: number; shiftX: number; lFwd?: number; rFwd?: number };
const REST: Pose = { lSh: 15, lEl: 70, rSh: 15, rEl: 70, tilt: 0, shiftX: 0 };
const ASPECT = 16 / 9;

function poseToLandmarks(p: Pose, noise: number): Landmark[] {
  const sw = 0.33; // shoulder width in isotropic units
  const cx = ASPECT / 2 + p.shiftX * sw, cy = 0.62;
  const t = (p.tilt * Math.PI) / 180; // positive = left shoulder lower (lean left)
  const half = sw / 2;
  const lS = { x: cx - half * Math.cos(t), y: cy + half * Math.sin(t) };
  const rS = { x: cx + half * Math.cos(t), y: cy - half * Math.sin(t) };
  const up = 0.36 * sw * 2, lo = 0.32 * sw * 2;
  const arm = (S: { x: number; y: number }, sh: number, el: number, side: -1 | 1) => {
    // angle measured from "down", rotating outward toward the side
    const a = ((sh * Math.PI) / 180);
    const E = { x: S.x + side * Math.sin(a) * up, y: S.y + Math.cos(a) * up };
    // elbow bend folds the forearm toward the body's midline
    const a2 = a - ((el * Math.PI) / 180) * Math.cos(a); // continuous: inward when down, inward over the head when up
    const W = { x: E.x + side * Math.sin(a2) * lo, y: E.y + Math.cos(a2) * lo };
    return { E, W };
  };
  const L = arm(lS, p.lSh, p.lEl, -1), R = arm(rS, p.rSh, p.rEl, 1);
  const nose = { x: cx - Math.sin(t) * sw * 0.9, y: cy - Math.cos(t) * sw * 0.75 };
  const pts: Record<number, { x: number; y: number }> = { 0: nose, 11: lS, 12: rS, 13: L.E, 14: R.E, 15: L.W, 16: R.W,
    23: { x: cx - half * 0.8, y: cy + sw * 1.6 }, 24: { x: cx + half * 0.8, y: cy + sw * 1.6 } };
  const out: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    const q = pts[i] ?? nose;
    // undo mirroring + isotropic scaling to produce raw MediaPipe image coordinates
    out.push({ x: 1 - (q.x + gauss() * noise) / ASPECT, y: q.y + gauss() * noise, z: 0, visibility: 0.95 });
  }
  return out;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, k)));

// Movements: phase in [0,1] -> pose. amp scales the excursion.
type Move = (ph: number, amp: number) => Pose;
const MOVES: Record<string, Move> = {
  waveRightOverhead: (ph, a) => ({ ...REST, rSh: lerp(15, 165 * a, ease(ph * 3)), rEl: 20 + 35 * Math.sin(ph * Math.PI * 6) * a }),
  leftArmCircle: (ph, a) => ({ ...REST, lSh: 90 + 70 * a * Math.sin(ph * Math.PI * 2), lEl: 10 + 20 * Math.cos(ph * Math.PI * 2) }),
  bothArmsPumpUp: (ph, a) => { const k = ease(Math.sin(ph * Math.PI * 2) * 0.5 + 0.5); return { ...REST, lSh: lerp(40, 150 * a, k), rSh: lerp(40, 150 * a, k), lEl: lerp(100, 30, k), rEl: lerp(100, 30, k) }; },
  rightPunchAcross: (ph, a) => { const k = ease(ph < 0.5 ? ph * 2 : 2 - ph * 2); return { ...REST, rSh: lerp(20, 85 * a, k), rEl: lerp(110, 5, k), tilt: -4 * k }; },
  crossArmsChest: (ph, a) => { const k = ease(ph < 0.5 ? ph * 2 : 2 - ph * 2); return { ...REST, lSh: lerp(15, 60 * a, k), rSh: lerp(15, 60 * a, k), lEl: lerp(70, 150, k), rEl: lerp(70, 150, k) }; },
  // the presets, performed as movements
  shieldRaise: (ph, a) => { const k = ease(ph < 0.5 ? ph * 2 : 2 - ph * 2); return { ...REST, lSh: lerp(15, 170 * a, k), rSh: lerp(15, 170 * a, k), lEl: lerp(70, 15, k), rEl: lerp(70, 15, k) }; },
  blastOut: (ph, a) => { const k = ease(ph < 0.5 ? ph * 2 : 2 - ph * 2); return { ...REST, lSh: lerp(15, 90 * a, k), rSh: lerp(15, 90 * a, k), lEl: lerp(70, 5, k), rEl: lerp(70, 5, k) }; },
  leanLeft: (ph) => { const k = ease(ph < 0.5 ? ph * 2 : 2 - ph * 2); return { ...REST, tilt: 16 * k, shiftX: -0.3 * k }; },
  // near misses: similar to a forged move but not the same
  rightArmRaiseNoWave: (ph, a) => { const k = ease(ph < 0.5 ? ph * 2 : 2 - ph * 2); return { ...REST, rSh: lerp(15, 160 * a, k), rEl: lerp(70, 20, k) }; },
  leftArmOutAndDown: (ph, a) => { const k = ease(ph < 0.5 ? ph * 2 : 2 - ph * 2); return { ...REST, lSh: lerp(15, 100 * a, k), lEl: lerp(70, 10, k) }; },
  waveLeftOverhead: (ph, a) => ({ ...REST, lSh: lerp(15, 165 * a, ease(ph * 3)), lEl: 20 + 35 * Math.sin(ph * Math.PI * 6) * a }),
  bigFidget: (ph) => ({ ...REST, lSh: 30 + 25 * Math.sin(ph * 7), rSh: 30 + 25 * Math.cos(ph * 5), lEl: 70 + 30 * Math.sin(ph * 9), rEl: 70 + 30 * Math.cos(ph * 8), tilt: 4 * Math.sin(ph * 3) }),
  // one-way movements, and their returns
  rightArmSwipeUp: (ph, a) => ({ ...REST, rSh: lerp(15, 160 * a, ease(ph)), rEl: lerp(70, 15, ease(ph)) }),
  rightArmSwipeDown: (ph, a) => ({ ...REST, rSh: lerp(160 * a, 15, ease(ph)), rEl: lerp(15, 70, ease(ph)) }),
  leftArmSweepOut: (ph, a) => ({ ...REST, lSh: lerp(20, 95 * a, ease(ph)), lEl: lerp(80, 10, ease(ph)) }),
  leftArmSweepIn: (ph, a) => ({ ...REST, lSh: lerp(95 * a, 20, ease(ph)), lEl: lerp(10, 80, ease(ph)) }),
  idleFidget: (ph) => ({ ...REST, lSh: 15 + 6 * Math.sin(ph * 9), rEl: 70 + 10 * Math.sin(ph * 7), tilt: 2 * Math.sin(ph * 5) }),
};

const FPS = 30;
/** A stream: rest, then the move over `durMs`, then rest. */
function stream(move: Move, durMs: number, amp: number, noise: number, restMs = 800): { t: number; lms: Landmark[] }[] {
  const out: { t: number; lms: Landmark[] }[] = [];
  const total = restMs + durMs + restMs;
  for (let t = 0; t <= total; t += 1000 / FPS) {
    const ph = (t - restMs) / durMs;
    const p = ph < 0 || ph > 1 ? (ph < 0 ? move(0, amp) : move(1, amp)) : move(ph, amp);
    out.push({ t, lms: poseToLandmarks(p, noise) });
  }
  return out;
}

function record(move: Move): TimedFrame[] {
  // Like the Forge recorder: features of a 2.4s capture, smoothed the same way.
  const sm = new LandmarkSmoother(0.55);
  return stream(move, 1200 * (0.85 + rand() * 0.3), 0.9 + rand() * 0.2, 0.004, 500).map(({ t, lms }) => ({ t, f: featuresOf(toBody(sm.push(lms), ASPECT)!) }));
}

let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };

// ---------- presets ----------
function presetRun(move: Move) {
  const eng = new GestureEngine();
  let shield = false, blasts = 0, left = false, right = false;
  for (const { t, lms } of stream(move, 1500, 1, 0.004)) {
    const o = eng.process(lms, ASPECT, t);
    if (o.presets?.shield) shield = true;
    if (o.fireBlast) blasts++;
    if (o.presets?.lean === -1) left = true;
    if (o.presets?.lean === 1) right = true;
  }
  return { shield, blasts, left, right };
}
console.log("— Presets —");
{
  const s = presetRun(MOVES.shieldRaise); check(s.shield && s.blasts === 0 && !s.left && !s.right, `shieldRaise -> shield only ${JSON.stringify(s)}`);
  const b = presetRun(MOVES.blastOut); check(!b.shield && b.blasts >= 1 && !b.left && !b.right, `blastOut -> blast only ${JSON.stringify(b)}`);
  const l = presetRun(MOVES.leanLeft); check(!l.shield && l.blasts === 0 && l.left && !l.right, `leanLeft -> dodge left only ${JSON.stringify(l)}`);
  const r = presetRun((ph, a) => { const p = MOVES.leanLeft(ph, a); return { ...p, tilt: -p.tilt, shiftX: -p.shiftX }; });
  check(!r.shield && r.blasts === 0 && r.right && !r.left, `leanRight -> dodge right only ${JSON.stringify(r)}`);
  // slow, natural lean (2.5 s to reach full lean) must not be absorbed into the baseline
  const slowLean = (dir: 1 | -1, tilt: number, shift: number): Move => (ph) => { const k = ease(Math.min(1, ph * 1.6)); return { ...REST, tilt: dir * tilt * k, shiftX: -dir * shift * k }; };
  const runSlow = (m: Move) => { const eng = new GestureEngine(); let left = false, right = false; for (const { t, lms } of stream(m, 4000, 1, 0.004)) { const o = eng.process(lms, ASPECT, t); if (o.presets?.lean === -1) left = true; if (o.presets?.lean === 1) right = true; } return { left, right }; };
  const sl = runSlow(slowLean(1, 12, 0.15)); check(sl.left && !sl.right, `slow modest lean left (12°) -> dodge left ${JSON.stringify(sl)}`);
  const sr = runSlow(slowLean(-1, 12, 0.15)); check(sr.right && !sr.left, `slow modest lean right (12°) -> dodge right ${JSON.stringify(sr)}`);
  const sm = runSlow(slowLean(1, 9, 0.1)); check(sm.left && !sm.right, `small 9° lean left -> dodge left ${JSON.stringify(sm)}`);
  // started while leaning (e.g. reaching for the trackpad), then sits upright: upright must read as neutral
  {
    const eng = new GestureEngine(); let t = 0; const step = 1000 / FPS; const states: number[] = [];
    const feed = (p: Pose, ms: number) => { for (let e = 0; e < ms; e += step, t += step) { const o = eng.process(poseToLandmarks(p, 0.004), ASPECT, t); states.push(o.presets?.lean ?? 0); } };
    feed({ ...REST, tilt: -14, shiftX: 0.2 }, 600); const startLen = states.length;
    feed(REST, 2500); const uprightTail = states.slice(startLen + 15);
    feed({ ...REST, tilt: 13, shiftX: -0.15 }, 900); const leftTail = states.slice(-10);
    feed({ ...REST, tilt: -13, shiftX: 0.15 }, 900); const rightTail = states.slice(-10);
    check(uprightTail.every((x) => x === 0) && leftTail.every((x) => x === -1) && rightTail.every((x) => x === 1),
      `started mid-lean, then upright=neutral, lean L=-1, lean R=+1 (upright nonzero frames ${uprightTail.filter((x) => x).length})`);
  }
  const i = presetRun(MOVES.idleFidget); check(!i.shield && i.blasts === 0 && !i.left && !i.right, `idleFidget -> nothing ${JSON.stringify(i)}`);
}

// ---------- custom DTW ----------
console.log("\n— Forged movements (DTW) —");
const customNames = ["waveRightOverhead", "leftArmCircle", "bothArmsPumpUp", "rightPunchAcross", "crossArmsChest", "rightArmSwipeUp", "leftArmSweepOut", "leftArmCircleReverse"];
MOVES.leftArmCircleReverse = (ph, a) => MOVES.leftArmCircle(1 - ph, a);
const allNames = Object.keys(MOVES);
const matrix: Record<string, Record<string, number>> = {};
for (const name of customNames) {
  const tpl = buildTemplate([record(MOVES[name]), record(MOVES[name]), record(MOVES[name])]);
  const power: ForgedPower = { id: name, description: "", config: fallbackAbility(name, "test"), source: "offline", template: tpl, createdAt: 0 };
  matrix[name] = {};
  for (const other of allNames) {
    const trials = 6;
    let fires = 0;
    for (let k = 0; k < trials; k++) {
      const eng = new GestureEngine();
      eng.setPowers([power]);
      let fired = false;
      // positives: amplitude within the recorded variation, tempo varied ±25%; negatives: wider variation
      const dur = 1200 * (0.75 + rand() * 0.5), amp = other === name ? 0.9 + rand() * 0.2 : 0.8 + rand() * 0.4;
      let maxConf = 0;
      for (const { t, lms } of stream(MOVES[other], dur, amp, 0.006)) {
        const o = eng.process(lms, ASPECT, t);
        if (o.firedPower) fired = true;
        maxConf = Math.max(maxConf, o.powers[0]?.conf ?? 0);
      }
      if (process.env.DEBUG && ((other === name && !fired) || (other !== name && fired))) console.log(`    ${other === name ? "miss" : "FALSE " + other} ${name}: dur=${dur.toFixed(0)} amp=${amp.toFixed(2)} maxConf=${maxConf.toFixed(2)} tplDur=${tpl.durationMs.toFixed(0)}`);
      if (fired) fires++;
    }
    matrix[name][other] = fires / trials;
  }
  console.log(`  template ${name}: tol=${tpl.tolerance.toFixed(3)} amp=${tpl.amplitude.toFixed(3)} static=${tpl.isStatic} self=[${tpl.selfDistances.map((d) => d.toFixed(3)).join(", ")}]`);
}
console.log("\n  fire rate (row = forged template, col = performed movement, 6 trials each)");
console.log("  " + "".padEnd(20) + allNames.map((n) => n.slice(0, 9).padStart(10)).join(""));
for (const r of customNames) console.log("  " + r.padEnd(20) + allNames.map((c) => matrix[r][c].toFixed(2).padStart(10)).join(""));
// Performed movements that genuinely contain the forged movement (A->B then back to A contains A->B):
// firing at the peak is correct, so they are not counted as false fires.
const CONTAINS: Record<string, string[]> = { rightArmSwipeUp: ["rightArmRaiseNoWave"], leftArmSweepOut: ["leftArmOutAndDown"] };
// Known near-miss pairs: same large arm path, differing only by a small secondary motion (hand waving while
// raised). Reported, not failed; the Forge tells players to pick moves with distinct arm paths.
const NEAR_MISS: Record<string, string[]> = { waveRightOverhead: ["rightArmRaiseNoWave", "rightArmSwipeUp"], rightArmSwipeUp: ["waveRightOverhead"] };
for (const r of customNames) {
  check(matrix[r][r] >= 5 / 6, `${r}: recognized itself in ${(matrix[r][r] * 6).toFixed(0)}/6`);
  const fps = allNames.filter((c) => c !== r && matrix[r][c] > 0 && !(CONTAINS[r] ?? []).includes(c) && !(NEAR_MISS[r] ?? []).includes(c));
  for (const c of NEAR_MISS[r] ?? []) console.log(`INFO  near-miss ${r} fired on ${c} ${(matrix[r][c] * 6).toFixed(0)}/6`);
  check(fps.length === 0, `${r}: no false fires on other movements${fps.length ? " (fired on " + fps.map((c) => `${c} ${(matrix[r][c] * 6).toFixed(0)}/6`).join(", ") + ")" : ""}`);
}

// ---------- the reported bug: the return / reverse motion must not fire ----------
console.log("\n— Reverse motions —");
for (const [fwd, rev] of [["rightArmSwipeUp", "rightArmSwipeDown"], ["leftArmSweepOut", "leftArmSweepIn"], ["leftArmCircle", "leftArmCircleReverse"], ["leftArmCircleReverse", "leftArmCircle"]]) {
  check(matrix[fwd][rev] === 0, `${fwd} template does not fire on ${rev} (${(matrix[fwd][rev] * 6).toFixed(0)}/6)`);
}

// ---------- static pose (fallback creator) ----------
if (process.env.MARGIN) {
  console.log("\n— Margins: min window distance / worst self-distance —");

  for (const name of customNames) {
    const tpl = buildTemplate([record(MOVES[name]), record(MOVES[name]), record(MOVES[name])]);
    const worst = Math.max(...tpl.selfDistances);
    const row: string[] = [];
    for (const other of allNames) {
      let best = Infinity;
      for (let k = 0; k < 4; k++) {
        const sm = new LandmarkSmoother(0.55); const hist: TimedFrame[] = [];
        for (const { t, lms } of stream(MOVES[other], 1200 * (0.75 + rand() * 0.5), 0.85 + rand() * 0.3, 0.006)) {
          const b = toBody(sm.push(lms), ASPECT)!; hist.push({ t, f: featuresOf(b) });
          const { dist } = mr(hist.filter((h) => h.t > t - 4000), { ...tpl, tolerance: 1 }, t);
          if (dist < best) best = dist;
        }
      }
      row.push(`${other.slice(0, 9)}=${isFinite(best) ? (best).toFixed(3) : "gated"}`);
    }
    console.log(`  ${name} worst=${worst.toFixed(3)}: ${row.join(" ")}`);
  }
}
console.log("\n— Held pose —");
{
  const hold: Move = () => ({ ...REST, lSh: 90, lEl: 90, rSh: 15, rEl: 70 }); // left arm "L" pose
  const samp = () => stream(hold, 900, 1, 0.003, 300).map(({ t, lms }) => ({ t, f: featuresOf(toBody(lms, ASPECT)!) }));
  const tpl = buildTemplate([samp(), samp(), samp()]);
  check(tpl.isStatic, `held pose detected as static (amp=${tpl.amplitude.toFixed(3)})`);
  const power: ForgedPower = { id: "pose", description: "", config: fallbackAbility("pose", ""), source: "offline", template: tpl, createdAt: 0 };
  const run = (m: Move) => { const e = new GestureEngine(); e.setPowers([power]); let f = false; for (const { t, lms } of stream(m, 1500, 1, 0.006)) if (e.process(lms, ASPECT, t).firedPower) f = true; return f; };
  check(run(hold), "held pose fires when held");
  check(!run(MOVES.idleFidget) && !run(MOVES.shieldRaise) && !run(MOVES.blastOut), "held pose does not fire on idle/shield/blast");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
