// Shared state between the React UI (camera, gestures, Forge) and the Phaser scene.
import type { AbilityConfig } from "./abilities";
import type { Lean } from "./gesture/presets";

export type GameResult = { won: boolean; score: number; timeMs: number };
export type GameEvent =
  | { type: "blast" }
  | { type: "power"; id: string; config: AbilityConfig; conf: number }
  | { type: "pause"; paused: boolean }
  | { type: "restart" }
  | { type: "over"; result: GameResult }
  | { type: "story"; beat: "nobody" };

type Listener = (e: GameEvent) => void;

/** Continuous inputs, read by the game every frame. */
export const inputState = { shield: false, lean: 0 as Lean, tracking: false };
/** Keyboard backup controls (for setup checks and emergencies): arrows lean, up/S shields. */
export const keyState = { shield: false, lean: 0 as Lean };

const listeners = new Set<Listener>();
export const bus = {
  on(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  emit(e: GameEvent) { listeners.forEach((fn) => fn(e)); },
};
