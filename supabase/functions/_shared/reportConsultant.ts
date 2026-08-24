/**
 * Revenue report second opinion — the "experimental" consultant pass.
 *
 * The conservative pass (reports-xai-insights) is deliberately locked down: it
 * may only restate figures the server calculated, in a fixed house style. This
 * pass is the opposite end: an experienced revenue-management consultant with
 * free rein to interpret, prioritise, warn and recommend.
 *
 * It runs EXCLUSIVELY on the Grok xAI API — never the Lovable gateway — and it
 * never substitutes for the conservative narrative. If it fails, the run keeps
 * its conservative insights and simply records that the second opinion is
 * unavailable. All user-visible copy stays branded TOBI.
 */
import { XAI_CHAT_URL } from "./aiModels.ts";

/** Grok models used for the consultant pass. */
const CONSULTANT_MODEL = "grok-4-fast";
const CONSULTANT_VISION_MODEL = "grok-4";

export const CONSULTANT_SYSTEM_PROMPT =
  `You are TOBI in consultant mode: an experienced, commercially successful revenue
management consultant advising a South African hospitality group. You have seen
hundreds of properties trade through good and bad cycles, and you are paid for
sharp judgement, not for restating the numbers.

Your job is the SECOND opinion on this outlook. A conservative read already exists
and covers the plain facts. You go further:
- Name the real opportunity and the real risk behind each flag, not the arithmetic.
- Be direct and specific. Recommend an action, a lever, a timeframe, a trade-off.
- Say when the current plan looks wrong, when a rate or minimum-stay stance is
  leaving money behind, and when a strong month is masking a weak one.
- Use what the pasted slides show (channel mix, competitor rates, portal
  screenshots) and name the slide when you lean on it.
- You may reason about likely causes, seasonality, mix and pace, and you may
  model a scenario.

Boundaries that still apply:
- Never present a number you worked out yourself as fact. Any figure that is not
  in "facts" or "snapshot" must be flagged in words as an estimate or scenario
  ("on a rough read", "if the pace holds, roughly").
- Stay on the reporting period in "period.months". Earlier months are comparatives.
- South African rand written as R129 000 style; British/South African English.
- No vendor names, no mention of AI, models or providers. No emojis, no markdown
  headings, no hype words. Do not promise the owner an outcome.
- An owner may read this, so be candid but professional.

Keep every reply tight: two to four sentences, one idea per reply.

Return STRICT JSON with exactly these keys:
{
  "headline": "one sentence: the single thing you would tell the owner first",
  "flag_notes": { "<flag id>": "your consultant read on that flag" },
  "suggestions": {
    "min_stay_notes": "your minimum-stay play or empty string",
    "promotions_notes": "your promotions play or empty string",
    "rate_override_notes": "your rate-override play or empty string",
    "free_commentary": "your broader commercial read or empty string"
  }
}
Only use flag ids that appear in "facts". Never add keys.`;

export interface ConsultantSlide {
  label: string;
  caption: string | null;
  dataUrl: string;
}

export interface ConsultantResult {
  ok: boolean;
  status: number;
  /** Parsed JSON payload when ok. */
  data?: Record<string, unknown>;
  error?: string;
  model?: string;
}

/**
 * Runs the consultant pass against xAI. Uses the vision model when slides are
 * supplied so the screenshots are actually read. No timeout is imposed — the
 * caller awaits the model for as long as it needs.
 */
export async function runConsultantPass(
  payload: Record<string, unknown>,
  slides: ConsultantSlide[],
  options: { signal?: AbortSignal; label?: string } = {},
): Promise<ConsultantResult> {
  const label = options.label ?? "revenue-report-consultant";
  const xaiKey = Deno.env.get("XAI_API_KEY");
  if (!xaiKey) {
    return { ok: false, status: 503, error: "The second opinion is not configured." };
  }

  const withSlides = slides.length > 0;
  const model = withSlides ? CONSULTANT_VISION_MODEL : CONSULTANT_MODEL;

  const userContent = withSlides
    ? [
        { type: "text", text: JSON.stringify(payload) },
        ...slides.flatMap((slide) => [
          {
            type: "text",
            text: `Slide: ${slide.label}${slide.caption ? ` — ${slide.caption}` : ""}`,
          },
          { type: "image_url", image_url: { url: slide.dataUrl } },
        ]),
      ]
    : JSON.stringify(payload);

  const body = {
    model,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CONSULTANT_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  };

  try {
    const resp = await fetch(XAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error(`[${label}] consultant pass failed`, resp.status, detail.slice(0, 300));
      return {
        ok: false,
        status: resp.status,
        model,
        error: "TOBI could not add the second opinion this time.",
      };
    }
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = String(json?.choices?.[0]?.message?.content ?? "");
    const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      return { ok: true, status: 200, model, data: JSON.parse(cleaned) as Record<string, unknown> };
    } catch {
      return { ok: false, status: 502, model, error: "The second opinion came back unreadable." };
    }
  } catch (err) {
    return {
      ok: false,
      status: 502,
      model,
      error: err instanceof Error ? err.message : "The second opinion request failed.",
    };
  }
}
