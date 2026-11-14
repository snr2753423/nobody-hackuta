// Body-relative pose features. Never raw pixels: every position is relative to the
// shoulder center and divided by shoulder width; every angle is a joint angle.
// Coordinates are mirrored (selfie view) and made isotropic using the video aspect ratio.

export type Landmark = { x: number; y: number; z: number; visibility?: number };
export type Vec = { x: number; y: number };

export type Body = {
  lS: Vec; rS: Vec; lE: Vec; rE: Vec; lW: Vec; rW: Vec; nose: Vec;
  center: Vec; // shoulder midpoint
  sw: number; // shoulder width
  down: Vec; // unit vector perpendicular to the shoulder line, pointing down the torso
  tilt: number; // radians, positive when the (screen) left shoulder is lower => leaning left
  visible: { arms: boolean; shoulders: boolean };
};

export const FEATURE_DIM = 14;
export const FEATURE_NAMES = [
  "L elbow angle", "R elbow angle", "L shoulder angle", "R shoulder angle",
  "L wrist x", "L wrist y", "R wrist x", "R wrist y",
  "shoulder tilt", "head offset",
  "L elbow x", "L elbow y", "R elbow x", "R elbow y",
];

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Vec) => Math.hypot(a.x, a.y);
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

export function angleBetween(a: Vec, b: Vec): number {
  const la = len(a), lb = len(b);
  if (la < 1e-6 || lb < 1e-6) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb))));
}

/** Convert MediaPipe normalized image landmarks into a mirrored, isotropic upper-body frame. */
export function toBody(lms: Landmark[], aspect: number): Body | null {
  if (!lms || lms.length < 17) return null;
  const p = (i: number): Vec => ({ x: (1 - lms[i].x) * aspect, y: lms[i].y });
  const v = (i: number) => lms[i].visibility ?? 1;
  const lS = p(11), rS = p(12);
  const sw = len(sub(rS, lS));
  if (sw < 0.03) return null;
  const s = sub(rS, lS);
  const down = { x: -s.y / sw, y: s.x / sw };
  const center = { x: (lS.x + rS.x) / 2, y: (lS.y + rS.y) / 2 };
  const tilt = Math.atan2(lS.y - rS.y, rS.x - lS.x);
  return {
    lS, rS, lE: p(13), rE: p(14), lW: p(15), rW: p(16), nose: p(0),
    center, sw, down, tilt,
    visible: {
      shoulders: v(11) > 0.5 && v(12) > 0.5,
      arms: v(13) > 0.35 && v(14) > 0.35 && v(15) > 0.35 && v(16) > 0.35,
    },
  };
}

/** 14-D feature vector: joint angles + body-relative trajectories. */
export function featuresOf(b: Body): number[] {
  const rel = (q: Vec) => ({ x: (q.x - b.center.x) / b.sw, y: (q.y - b.center.y) / b.sw });
  const lElbow = angleBetween(sub(b.lS, b.lE), sub(b.lW, b.lE));
  const rElbow = angleBetween(sub(b.rS, b.rE), sub(b.rW, b.rE));
  const lShoulder = angleBetween(sub(b.lE, b.lS), b.down);
  const rShoulder = angleBetween(sub(b.rE, b.rS), b.down);
  const lw = rel(b.lW), rw = rel(b.rW), le = rel(b.lE), re = rel(b.rE);
  const head = (b.nose.x - b.center.x) / b.sw;
  return [
    lElbow / Math.PI, rElbow / Math.PI, lShoulder / Math.PI, rShoulder / Math.PI,
    lw.x / 2, lw.y / 2, rw.x / 2, rw.y / 2,
    b.tilt * 2, head,
    le.x / 2, le.y / 2, re.x / 2, re.y / 2,
  ];
}

/** Exponential smoothing of raw landmarks with hold-last-good for low-visibility points. */
export class LandmarkSmoother {
  private prev: Landmark[] | null = null;
  constructor(private alpha = 0.55) {}
  reset() { this.prev = null; }
  push(lms: Landmark[]): Landmark[] {
    if (!this.prev) { this.prev = lms.map((l) => ({ ...l })); return this.prev; }
    const out = lms.map((l, i) => {
      const q = this.prev![i];
      const vis = l.visibility ?? 1;
      if (vis < 0.2) return { ...q, visibility: vis }; // hold last position, keep honest visibility
      const a = this.alpha;
      return { x: q.x + a * (l.x - q.x), y: q.y + a * (l.y - q.y), z: q.z + a * (l.z - q.z), visibility: vis };
    });
    this.prev = out;
    return out;
  }
}
