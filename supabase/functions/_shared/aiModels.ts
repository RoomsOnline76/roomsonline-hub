/**
 * Central AI model registry — single source of truth for every AI call in ROL'OS.
 *
 * Selection driver: cost per token. For each task we pick the cheapest model that
 * still holds up at scale, and only step up when the task genuinely needs it
 * (vision reasoning, long-form prose, complex planning).
 *
 * All user-visible AI in ROL'OS is branded TOBI. Never surface model or vendor
 * names in UI copy.
 *
 * Cost tiers (cheapest first):
 *   1. google/gemini-3.1-flash-lite  — high-volume extraction, mapping, classification
 *   2. google/gemini-3.6-flash       — default chat / reasoning / agentic work
 *   3. google/gemini-3.5-flash       — long-form prose and editorial polish
 *   4. google/gemini-2.5-pro         — vision-heavy verification only
 */

export const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Cost tiers, cheapest first. */
export const AI_TIER = {
  /** Cheapest — structured extraction, mapping, classification, JSON shaping. */
  extract: "google/gemini-3.1-flash-lite",
  /** Default — conversational, reasoning, agentic. */
  chat: "google/gemini-3.6-flash",
  /** Prose quality step-up — editorial, brochures, guest narrative. */
  prose: "google/gemini-3.5-flash",
  /** Vision reasoning step-up — image/document verification only. */
  vision: "google/gemini-2.5-pro",
} as const;

export type AiTier = keyof typeof AI_TIER;

/**
 * Task → model. Add a task here rather than hardcoding a model in a function,
 * so a model upgrade or a cost change is a one-line edit.
 */
export const AI_MODELS = {
  // --- Conversational (TOBI) ---
  help_assistant: AI_TIER.chat,
  connect_assistant: AI_TIER.chat,
  booking_concierge: AI_TIER.chat,
  journey_assistant: AI_TIER.chat,

  // --- Extraction / mapping / classification (highest volume, cheapest tier) ---
  property_search: AI_TIER.extract,
  room_parsing: AI_TIER.extract,
  amenity_mapping: AI_TIER.extract,
  website_extraction: AI_TIER.extract,
  review_sentiment: AI_TIER.extract,
  test_scenarios: AI_TIER.extract,

  // --- Prose / editorial ---
  editorial: AI_TIER.prose,
  property_description: AI_TIER.prose,
  content_enrichment: AI_TIER.prose,

  itinerary_narrative: AI_TIER.prose,
  experience_curation: AI_TIER.prose,
  experience_engine: AI_TIER.prose,
  integration_assets: AI_TIER.prose,

  // --- Analysis / insight narrative ---
  revenue_insights: AI_TIER.chat,
  dashboard_insights: AI_TIER.chat,
  health_report: AI_TIER.chat,

  // --- Vision ---
  age_verification: AI_TIER.chat, // Gemini flash handles ID reads at a fraction of pro cost
  image_validation: AI_TIER.vision,
} as const;

export type AiTask = keyof typeof AI_MODELS;

/** Recommended temperature per intent: 0.3 for extraction, 0.5 for prose. */
export const AI_TEMPERATURE = { extract: 0.3, prose: 0.5, chat: 0.5 } as const;

export function modelForTask(task: AiTask): string {
  return AI_MODELS[task];
}

export interface AiCallOptions {
  task: AiTask;
  messages: Array<Record<string, unknown>>;
  temperature?: number;
  maxTokens?: number;
  /** Pass { type: "json_object" } to force JSON output. */
  responseFormat?: Record<string, unknown>;
  tools?: unknown[];
  signal?: AbortSignal;
}

export type AiFailureCode =
  | "MISSING_KEY"
  | "RATE_LIMITED"
  | "CREDITS_EXHAUSTED"
  | "SPEND_LIMIT_REACHED"
  | "AI_ERROR";

export interface AiCallResult {
  ok: boolean;
  content: string | null;
  status: number;
  /** Stable error code the UI can map to a friendly TOBI message. */
  code?: AiFailureCode;
  error?: string;
  raw?: unknown;
}

/**
 * Map a gateway non-2xx into the message a property owner should actually read.
 * 403 `credit_limit_reached` is a workspace SPEND CAP, not an outage and not an
 * exhausted balance — every TOBI feature dies at once and the only fix is raising
 * the cap, so say that instead of "TOBI request failed (403)".
 */
export function describeAiFailure(status: number, detail: string): { code: AiFailureCode; error: string } {
  const body = (detail || "").toLowerCase();
  if (status === 429) {
    return { code: "RATE_LIMITED", error: "TOBI is busy right now. Please try again in a moment." };
  }
  if (status === 402) {
    return { code: "CREDITS_EXHAUSTED", error: "AI credits are exhausted. Please top up to continue using TOBI." };
  }
  if (status === 403 && (body.includes("credit_limit_reached") || body.includes("credit limit"))) {
    return {
      code: "SPEND_LIMIT_REACHED",
      error:
        "TOBI is paused: the workspace monthly AI spend limit has been reached. Raise the limit to resume TOBI features.",
    };
  }
  return { code: "AI_ERROR", error: detail?.slice(0, 300) || "TOBI request failed." };
}


/**
 * Single entry point for gateway chat calls. Centralises auth, model selection
 * and the 402/429 handling that used to be duplicated in every function.
 */
export async function callLovableAi(options: AiCallOptions): Promise<AiCallResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return { ok: false, content: null, status: 500, code: "MISSING_KEY", error: "AI is not configured." };
  }

  const model = modelForTask(options.task);
  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options.responseFormat) body.response_format = options.responseFormat;
  if (options.tools) body.tools = options.tools;

  let response: Response;
  try {
    response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    return {
      ok: false,
      content: null,
      status: 502,
      code: "AI_ERROR",
      error: err instanceof Error ? err.message : "AI request failed",
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[ai:${options.task}] ${model} -> ${response.status}`, detail.slice(0, 500));
    if (response.status === 429) {
      return {
        ok: false,
        content: null,
        status: 429,
        code: "RATE_LIMITED",
        error: "TOBI is handling a lot of requests right now. Please try again shortly.",
      };
    }
    if (response.status === 402) {
      return {
        ok: false,
        content: null,
        status: 402,
        code: "CREDITS_EXHAUSTED",
        error: "AI credits are exhausted. Please top up to continue using TOBI.",
      };
    }
    return { ok: false, content: null, status: response.status, code: "AI_ERROR", error: detail || "AI request failed" };
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content ?? null;
  return { ok: true, content, status: 200, raw: result };
}
