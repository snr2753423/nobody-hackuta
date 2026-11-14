"use client";
// One shared gesture engine and a tiny pub/sub for per-frame results.
import { GestureEngine, type EngineOutput } from "./gesture/engine";

type Sub = (o: EngineOutput, now: number) => void;
const subs = new Set<Sub>();

export const poseHub = {
  engine: new GestureEngine(),
  latest: null as EngineOutput | null,
  /** "fight" routes gestures into the game; anything else only observes. */
  mode: "idle" as "idle" | "fight" | "forge",
  subscribe(fn: Sub) { subs.add(fn); return () => { subs.delete(fn); }; },
  publish(o: EngineOutput, now: number) { this.latest = o; subs.forEach((fn) => fn(o, now)); },
};
