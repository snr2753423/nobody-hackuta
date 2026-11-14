// Ability configs: the only things a forged power can do. Gemini picks from this allowlist;
// every config (Gemini or fallback) passes through validateAbility() before the game sees it.

export const EFFECTS = ["lightning", "fire", "ice", "wind", "quake", "light", "wave", "vines"] as const;
export type Effect = (typeof EFFECTS)[number];

export type AbilityConfig = {
  name: string;
  effect: Effect;
  damage: number; // 0-30 boss HP
  stunSeconds: number; // 0-3, boss cannot attack while stunned
  cooldownSeconds: number; // 2-10
  heal: number; // 0-25 player HP
  flavor: string; // one short line shown when cast
};

export const LIMITS = {
  damage: [0, 30],
  stunSeconds: [0, 3],
  cooldownSeconds: [2, 10],
  heal: [0, 25],
} as const;

export const EFFECT_STYLE: Record<Effect, { color: number; css: string; label: string }> = {
  lightning: { color: 0xfff27a, css: "#fff27a", label: "Lightning" },
  fire: { color: 0xff6a2b, css: "#ff6a2b", label: "Fire" },
  ice: { color: 0x9ee8ff, css: "#9ee8ff", label: "Ice" },
  wind: { color: 0xd8f5e0, css: "#d8f5e0", label: "Wind" },
  quake: { color: 0xb07a4a, css: "#b07a4a", label: "Quake" },
  light: { color: 0xfff8e0, css: "#fff8e0", label: "Light" },
  wave: { color: 0x4fb3ff, css: "#4fb3ff", label: "Wave" },
  vines: { color: 0x7ad35a, css: "#7ad35a", label: "Vines" },
};

const clamp = (v: unknown, [lo, hi]: readonly [number, number], dflt: number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
};

/** Coerce anything into a safe, supported config. Never throws. */
export function validateAbility(raw: unknown, fallbackName = "Unnamed Power"): AbilityConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const effect = (EFFECTS as readonly string[]).includes(String(r.effect)) ? (r.effect as Effect) : "light";
  const name = String(r.name ?? fallbackName).replace(/[^\p{L}\p{N} '\-!]/gu, "").trim().slice(0, 28) || fallbackName;
  const flavor = String(r.flavor ?? "").replace(/[<>]/g, "").trim().slice(0, 90);
  let damage = Math.round(clamp(r.damage, LIMITS.damage, 15));
  const stunSeconds = Math.round(clamp(r.stunSeconds, LIMITS.stunSeconds, 0) * 10) / 10;
  const heal = Math.round(clamp(r.heal, LIMITS.heal, 0));
  let cooldownSeconds = Math.round(clamp(r.cooldownSeconds, LIMITS.cooldownSeconds, 4) * 10) / 10;
  // Balance rule: stronger powers recharge slower.
  const power = damage + stunSeconds * 6 + heal * 0.8;
  cooldownSeconds = Math.max(cooldownSeconds, Math.min(10, 2 + power / 8));
  if (damage === 0 && stunSeconds === 0 && heal === 0) damage = 10;
  return { name, effect, damage, stunSeconds, cooldownSeconds: Math.round(cooldownSeconds * 10) / 10, heal, flavor: flavor || `${name}!` };
}

const KEYWORDS: [Effect, RegExp][] = [
  ["lightning", /lightning|thunder|storm|zeus|bolt|shock|electric|spark/i],
  ["fire", /fire|flame|burn|blaze|inferno|sun|heat|ember/i],
  ["ice", /ice|frost|freez|cold|snow|glacier/i],
  ["wind", /wind|gust|air|tornado|breeze|whirl|aeolus/i],
  ["quake", /quake|earth|rock|stone|boulder|ground|stomp|poseidon/i],
  ["wave", /wave|water|sea|ocean|tide|flood/i],
  ["vines", /vine|plant|root|thorn|tree|olive|nature|entangle/i],
  ["light", /light|heal|athena|wisdom|holy|radiant|shine|blind/i],
];

/** Offline oracle: deterministic keyword mapping used when Gemini is unavailable. */
export function fallbackAbility(name: string, description: string): AbilityConfig {
  const text = `${name} ${description}`;
  const effect = KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "light";
  const stun = /stun|freez|paraly|daze|stop|bind|entangle|blind|root/i.test(text) ? 1.5 : 0;
  const heal = /heal|restore|mend|life|cure/i.test(text) ? 15 : 0;
  const big = /mega|ultimate|massive|huge|devastat|giant|great/i.test(text);
  return validateAbility(
    {
      name: name || "Unnamed Power",
      effect,
      damage: heal && !/damage|strike|hit|blast|attack/i.test(text) ? 4 : big ? 22 : 15,
      stunSeconds: stun,
      heal,
      cooldownSeconds: big ? 7 : 4,
      flavor: description.slice(0, 90),
    },
    name,
  );
}

/** Built-in backup power for the demo if nobody has forged one yet. */
export const BACKUP_ABILITY: AbilityConfig = validateAbility({
  name: "Athena's Lightning",
  effect: "lightning",
  damage: 18,
  stunSeconds: 1.5,
  cooldownSeconds: 5,
  heal: 0,
  flavor: "Grey-eyed Athena lends you a stroke of her father's lightning.",
});
