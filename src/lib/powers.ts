// Forged powers: a gesture template bound to an ability config, persisted in localStorage.
import { validateAbility, type AbilityConfig } from "./abilities";
import { toleranceFor, type GestureTemplate, type Sensitivity } from "./gesture/dtw";

export type ForgedPower = {
  id: string;
  description: string;
  config: AbilityConfig;
  source: "gemini" | "offline";
  template: GestureTemplate;
  sensitivity?: Sensitivity;
  createdAt: number;
};

const KEY = "nobody.powers.v1";
export const MAX_POWERS = 3;

export function loadPowers(): ForgedPower[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ForgedPower[];
    return Array.isArray(arr)
      ? arr
          .filter((p) => p?.template?.frames?.length && p.config)
          .map((p) => ({
            ...p,
            config: validateAbility(p.config, p.config?.name),
            template: { ...p.template, tolerance: toleranceFor(p.template.selfDistances ?? [0.05]) },
          }))
      : [];
  } catch {
    return [];
  }
}

export function savePowers(powers: ForgedPower[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(powers.slice(0, MAX_POWERS)));
  } catch {
    /* storage unavailable: powers live for this session only */
  }
}
