// Tiny WebAudio synthesizer: every sound is generated in code, no audio files.
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) { muted = m; }
export function unlockAudio() { ac(); }

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.15, slideTo?: number, delay = 0) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, filterFreq = 1200, delay = 0) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filterFreq;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  blast() { tone(520, 0.25, "sawtooth", 0.08, 1400); noise(0.2, 0.1, 3000); },
  hitBoss() { tone(140, 0.25, "square", 0.12, 60); noise(0.15, 0.15, 800); },
  hurt() { tone(220, 0.35, "sawtooth", 0.12, 80); noise(0.3, 0.2, 500); },
  block() { tone(880, 0.3, "triangle", 0.15); tone(1320, 0.25, "triangle", 0.08, undefined, 0.02); },
  dodge() { noise(0.18, 0.12, 2500); },
  roar() { tone(90, 0.9, "sawtooth", 0.16, 45); noise(0.8, 0.12, 400); },
  warn() { tone(660, 0.12, "square", 0.06); tone(660, 0.12, "square", 0.06, undefined, 0.18); },
  power() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.35, "triangle", 0.1, undefined, i * 0.06)); noise(0.5, 0.12, 4000, 0.1); },
  forge() { tone(300, 0.15, "square", 0.08); tone(600, 0.2, "triangle", 0.1, undefined, 0.08); },
  victory() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.4, "triangle", 0.12, undefined, i * 0.14)); },
  defeat() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, "sine", 0.12, undefined, i * 0.22)); },
  laugh() { [180, 160, 180, 150].forEach((f, i) => tone(f, 0.18, "sawtooth", 0.08, f * 0.8, i * 0.2)); },
};
