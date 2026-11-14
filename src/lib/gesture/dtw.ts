// Dynamic time warping over joint-angle / body-relative feature sequences.
// Templates are built from 3 recorded samples with no model training:
//   trim idle frames -> resample -> pick the medoid -> DTW barycenter averaging (a few passes).
// Recognition compares sliding windows of recent movement against each template.

export type Seq = number[][];
export type TimedFrame = { t: number; f: number[] };

export const TEMPLATE_LEN = 32;
export const MIN_CONFIDENCE = 0.5; // confidence at which a power fires (distance == tolerance)

export function frameDist(a: number[], b: number[], w?: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += (w ? w[i] : 1) * d * d; }
  return Math.sqrt(s / a.length);
}

/**
 * Per-feature weights from how much each feature moves in the template (mean weight 1).
 * The joints that define a gesture dominate, so e.g. holding an arm up no longer looks like waving it.
 */
export function featureWeights(frames: Seq): number[] {
  const D = frames[0].length;
  const r = Array.from({ length: D }, (_, d) => {
    let lo = Infinity, hi = -Infinity;
    for (const f of frames) { lo = Math.min(lo, f[d]); hi = Math.max(hi, f[d]); }
    return hi - lo + 0.04;
  });
  const mean = r.reduce((x, y) => x + y, 0) / D;
  return r.map((x) => x / mean);
}

export function resample(seq: Seq, n: number): Seq {
  if (seq.length === 0) return [];
  if (seq.length === 1) return Array.from({ length: n }, () => seq[0].slice());
  const out: Seq = [];
  for (let i = 0; i < n; i++) {
    const pos = (i * (seq.length - 1)) / (n - 1);
    const lo = Math.floor(pos), hi = Math.min(seq.length - 1, lo + 1), w = pos - lo;
    out.push(seq[lo].map((v, d) => v * (1 - w) + seq[hi][d] * w));
  }
  return out;
}

/**
 * DTW with a Sakoe-Chiba band. The distance is normalized by (n+m)/2, not by the warping-path length:
 * path-length normalization lets a long path hug cheap frames, which made a movement performed in
 * reverse (e.g. returning to rest) score as a match.
 */
export function dtw(a: Seq, b: Seq, bandFrac = 0.3, w?: number[]): { dist: number; path: [number, number][] } {
  const n = a.length, m = b.length;
  const band = Math.max(Math.ceil(Math.max(n, m) * bandFrac), Math.abs(n - m) + 1);
  const INF = Infinity;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const jc = Math.round((i * m) / n);
    const j0 = Math.max(1, jc - band), j1 = Math.min(m, jc + band);
    for (let j = j0; j <= j1; j++) {
      const c = frameDist(a[i - 1], b[j - 1], w);
      const best = Math.min(D[i - 1][j - 1], D[i - 1][j], D[i][j - 1]);
      D[i][j] = best + c;
    }
  }
  if (!isFinite(D[n][m])) return { dist: INF, path: [] };
  // backtrack
  const path: [number, number][] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    const d = D[i - 1][j - 1], u = D[i - 1][j], l = D[i][j - 1];
    if (d <= u && d <= l) { i--; j--; } else if (u <= l) i--; else j--;
  }
  path.reverse();
  return { dist: D[n][m] / ((n + m) / 2), path };
}

/** Mean per-dimension range: how much the movement actually moves. */
export function amplitude(seq: Seq): number {
  if (seq.length === 0) return 0;
  const D = seq[0].length;
  let total = 0;
  for (let d = 0; d < D; d++) {
    let lo = Infinity, hi = -Infinity;
    for (const f of seq) { lo = Math.min(lo, f[d]); hi = Math.max(hi, f[d]); }
    total += hi - lo;
  }
  return total / D;
}

/** Remove still frames at the start and end of a recorded sample. */
export function trimIdle(frames: TimedFrame[]): TimedFrame[] {
  if (frames.length < 6) return frames;
  const speed = frames.map((fr, i) => (i === 0 ? 0 : frameDist(fr.f, frames[i - 1].f)));
  // smooth speed
  const sm = speed.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(speed.length - 1, i + 2); k++) { s += speed[k]; c++; }
    return s / c;
  });
  const max = Math.max(...sm);
  if (max < 0.004) return frames; // static pose: keep everything
  // Noise-aware threshold: webcam jitter alone can exceed a fixed fraction of peak speed.
  const sorted = [...sm].sort((x, y) => x - y);
  const quiet = sorted[Math.floor(sorted.length * 0.25)]; // typical speed while holding still
  const thr = Math.max(max * 0.2, quiet * 2.5);
  let a = sm.findIndex((s) => s > thr);
  let b = sm.length - 1 - [...sm].reverse().findIndex((s) => s > thr);
  a = Math.max(0, a - 2); b = Math.min(frames.length - 1, b + 2);
  const out = frames.slice(a, b + 1);
  return out.length >= 6 ? out : frames;
}

export type GestureTemplate = {
  frames: Seq; // TEMPLATE_LEN x FEATURE_DIM
  durationMs: number;
  tolerance: number; // DTW distance at which confidence == MIN_CONFIDENCE
  amplitude: number;
  isStatic: boolean; // a held pose rather than a movement
  selfDistances: number[]; // each sample's DTW distance to the template (consistency)
};

export const TOL_MIN = 0.045;
export const TOL_MAX = 0.12;
/** Per-power sensitivity: scales the tolerance at match time. */
export const SENSITIVITY = { strict: 0.75, normal: 1, loose: 1.3 } as const;
export type Sensitivity = keyof typeof SENSITIVITY;
export const STATIC_AMPLITUDE = 0.05;

export function buildTemplate(samples: TimedFrame[][]): GestureTemplate {
  const trimmed = samples.map(trimIdle);
  const durations = trimmed.map((s) => s[s.length - 1].t - s[0].t).sort((x, y) => x - y);
  const seqs = trimmed.map((s) => resample(s.map((x) => x.f), TEMPLATE_LEN));
  const amp = seqs.reduce((s, q) => s + amplitude(q), 0) / seqs.length;
  const isStatic = amp < STATIC_AMPLITUDE;

  let tpl: Seq;
  if (isStatic) {
    // A held pose: the template is the mean frame repeated.
    const all = seqs.flat();
    const mean = all[0].map((_, d) => all.reduce((s, f) => s + f[d], 0) / all.length);
    tpl = Array.from({ length: TEMPLATE_LEN }, () => mean.slice());
  } else {
    // Medoid start, then DTW barycenter averaging.
    let bestI = 0, bestS = Infinity;
    seqs.forEach((s, i) => {
      const tot = seqs.reduce((acc, o, j) => (i === j ? acc : acc + dtw(s, o).dist), 0);
      if (tot < bestS) { bestS = tot; bestI = i; }
    });
    tpl = seqs[bestI].map((f) => f.slice());
    for (let iter = 0; iter < 3; iter++) {
      const sums = tpl.map((f) => f.map(() => 0));
      const counts = tpl.map(() => 0);
      for (const s of seqs) {
        for (const [ti, si] of dtw(tpl, s).path) {
          counts[ti]++;
          s[si].forEach((v, d) => (sums[ti][d] += v));
        }
      }
      tpl = sums.map((f, i) => (counts[i] ? f.map((v) => v / counts[i]) : tpl[i]));
    }
  }
  const w = featureWeights(tpl);
  const selfDistances = seqs.map((s) => (isStatic ? meanStaticDist(s, tpl[0]) : dtw(tpl, s, 0.3, w).dist));
  const tolerance = toleranceFor(selfDistances);
  return {
    frames: tpl,
    durationMs: Math.max(300, durations[Math.floor(durations.length / 2)]),
    tolerance,
    amplitude: amp,
    isStatic,
    selfDistances,
  };
}

function meanStaticDist(seq: Seq, pose: number[]) {
  return seq.reduce((s, f) => s + frameDist(f, pose), 0) / seq.length;
}

/** Tolerance rule, shared by template building and by re-tuning templates saved by older builds. */
export function toleranceFor(selfDistances: number[]): number {
  return Math.min(TOL_MAX, Math.max(TOL_MIN, Math.max(...selfDistances) * 1.3 + 0.02));
}

export function confidenceFor(dist: number, tolerance: number): number {
  // conf = 1 at a perfect match, MIN_CONFIDENCE (0.5) at the tolerance, 0 at twice the tolerance.
  return Math.max(0, Math.min(1, 1 - dist / (2 * tolerance)));
}

/** Net change from first to last frame, and its RMS size. */
export function netChange(seq: Seq): { v: number[]; mag: number } {
  const v = seq[seq.length - 1].map((x, d) => x - seq[0][d]);
  return { v, mag: Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length) };
}

/** Movements with a clear net direction (A -> B) must be performed in that direction, not B -> A. */
export const NET_MIN = 0.04;
function sameDirection(win: Seq, tplNet: { v: number[]; mag: number }): boolean {
  if (tplNet.mag < NET_MIN) return true; // cyclic / there-and-back movement: no net direction to check
  const w = netChange(win);
  if (w.mag < tplNet.mag * 0.5) return false;
  const dot = w.v.reduce((s, x, d) => s + x * tplNet.v[d], 0);
  const cos = dot / (Math.sqrt(w.v.reduce((s, x) => s + x * x, 0)) * Math.sqrt(tplNet.v.reduce((s, x) => s + x * x, 0)) + 1e-9);
  return cos > 0.6;
}

/** Total distance travelled through feature space (weighted). Waving travels far; raise-and-hold does not. */
export function pathLength(seq: Seq, w?: number[]): number {
  let s = 0;
  for (let i = 1; i < seq.length; i++) s += frameDist(seq[i], seq[i - 1], w);
  return s;
}

/** Score the most recent movement in `history` against a template. */
export function matchRecent(history: TimedFrame[], tpl: GestureTemplate, now: number, sensitivity: Sensitivity = "normal"): { conf: number; dist: number } {
  if (history.length < 6) return { conf: 0, dist: Infinity };
  const tol = tpl.tolerance * SENSITIVITY[sensitivity];
  if (tpl.isStatic) {
    const win = history.filter((h) => h.t >= now - 450);
    if (win.length < 5) return { conf: 0, dist: Infinity };
    const seq = win.map((w) => w.f);
    if (amplitude(seq) > STATIC_AMPLITUDE * 2) return { conf: 0, dist: Infinity }; // must be held still
    const dist = meanStaticDist(seq, tpl.frames[0]);
    return { conf: confidenceFor(dist, tol), dist };
  }
  let best = Infinity;
  const tplNet = netChange(tpl.frames);
  const w = featureWeights(tpl.frames);
  const tplPath = pathLength(tpl.frames, w);
  for (const scale of [0.7, 1.0, 1.35]) {
    const win = history.filter((h) => h.t >= now - tpl.durationMs * scale);
    if (win.length < 6) continue;
    const seq = win.map((w) => w.f);
    if (amplitude(seq) < tpl.amplitude * 0.55) continue; // small or idle motion never matches a movement
    const rs = resample(seq, TEMPLATE_LEN);
    if (!sameDirection(rs, tplNet)) continue; // e.g. the return-to-rest of a one-way movement
    const pr = pathLength(rs, w) / (tplPath + 1e-9);
    if (pr < 0.7 || pr > 1.6) continue; // much less (or more) motion than the recorded move
    const d = dtw(rs, tpl.frames, 0.3, w).dist;
    if (d < best) best = d;
  }
  return { conf: isFinite(best) ? confidenceFor(best, tol) : 0, dist: best };
}
