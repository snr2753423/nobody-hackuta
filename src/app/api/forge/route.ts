// The one Gemini call: plain-words ability description -> structured, allowlisted ability config.
// Called once per Forge, never per frame. Any failure returns the offline (keyword) config instead.
import { GoogleGenAI, Type } from "@google/genai";
import { EFFECTS, LIMITS, fallbackAbility, validateAbility } from "@/lib/abilities";

// Verified available to this key on 2026-11-14 via the models list endpoint. First that works wins.
const MODELS = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []).concat(["gemini-3.5-flash-lite", "gemini-flash-lite-latest"]);

const SYSTEM = `You are the Oracle in "NOBODY", a game retelling Odysseus's escape from the Cyclops Polyphemus (Homer, Odyssey Book 9).
The player invented a body movement and described the power it should trigger. Translate their words into a balanced game ability.
Rules:
- effect MUST be one of: ${EFFECTS.join(", ")}. Pick the closest match to the description.
- damage ${LIMITS.damage[0]}-${LIMITS.damage[1]} (boss has 100 HP; a normal blast does 7). stunSeconds ${LIMITS.stunSeconds[0]}-${LIMITS.stunSeconds[1]}. cooldownSeconds ${LIMITS.cooldownSeconds[0]}-${LIMITS.cooldownSeconds[1]}. heal ${LIMITS.heal[0]}-${LIMITS.heal[1]}.
- Stronger powers need longer cooldowns. Only stun if the description implies stopping, freezing, blinding, binding or stunning. Only heal if it implies healing.
- name: keep the player's name (max 28 chars). flavor: one vivid line under 90 characters in a Homeric voice.`;

const schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    effect: { type: Type.STRING, enum: [...EFFECTS] },
    damage: { type: Type.INTEGER },
    stunSeconds: { type: Type.NUMBER },
    cooldownSeconds: { type: Type.NUMBER },
    heal: { type: Type.INTEGER },
    flavor: { type: Type.STRING },
  },
  required: ["name", "effect", "damage", "stunSeconds", "cooldownSeconds", "heal", "flavor"],
  propertyOrdering: ["name", "effect", "damage", "stunSeconds", "cooldownSeconds", "heal", "flavor"],
};

export async function POST(req: Request) {
  let name = "", description = "";
  try {
    const body = await req.json();
    name = String(body?.name ?? "").slice(0, 40);
    description = String(body?.description ?? "").slice(0, 300);
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const offline = (reason: string) =>
    Response.json({ source: "offline", reason, config: fallbackAbility(name, description) });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return offline("No GEMINI_API_KEY set");
  if (req.headers.get("x-force-offline") === "1") return offline("Offline mode forced");

  const ai = new GoogleGenAI({ apiKey });
  let lastErr = "";
  for (const model of MODELS) {
    const t0 = Date.now();
    try {
      const res = await ai.models.generateContent({
        model,
        contents: `Power name: ${name || "(unnamed)"}\nDescription: ${description || "(none)"}`,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.4,
          abortSignal: AbortSignal.timeout(9000),
        },
      });
      const text = res.text ?? "";
      const raw = JSON.parse(text);
      const config = validateAbility(raw, name || "Unnamed Power");
      return Response.json({ source: "gemini", model, ms: Date.now() - t0, raw, config });
    } catch (e) {
      lastErr = `${model}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
      console.warn("[forge] gemini failed", lastErr);
    }
  }
  return offline(`Gemini unavailable (${lastErr})`);
}
