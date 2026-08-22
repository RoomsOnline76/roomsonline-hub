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
  revenue_report_insights: AI_TIER.chat,
  /** Same narrative, but reading the reviewer's pasted report screenshots. */
  revenue_report_insights_vision: AI_TIER.vision,
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

// ---------------------------------------------------------------------------
// xAI (Grok) standby transport
// ---------------------------------------------------------------------------
// The Lovable AI Gateway remains TOBI's primary brain. xAI is a standby only:
// when the gateway is spend-capped, out of credits, rate limited or down, TOBI
// keeps working instead of failing in the owner's face. Never surface either
// vendor name in UI copy — this is all "TOBI".

export const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";

/** Gateway model id -> nearest Grok equivalent for the standby run. */
const XAI_EQUIVALENT: Record<string, string> = {
  [AI_TIER.extract]: "grok-3-mini",
  [AI_TIER.chat]: "grok-4-fast",
  [AI_TIER.prose]: "grok-4-fast",
  [AI_TIER.vision]: "grok-4",
};

const FALLBACK_WORTHY: AiFailureCode[] = ["SPEND_LIMIT_REACHED", "CREDITS_EXHAUSTED", "RATE_LIMITED", "AI_ERROR"];

export interface AiChatOutcome {
  ok: boolean;
  status: number;
  /** "gateway" or "xai" — which brain actually answered. */
  provider: "gateway" | "xai";
  data?: Record<string, unknown>;
  code?: AiFailureCode;
  error?: string;
}

/**
 * POST an OpenAI-shaped chat body to the gateway, standing by on xAI when the
 * gateway refuses. `body.model` must be a gateway model id from AI_MODELS.
 */
export async function aiChat(
  body: Record<string, unknown>,
  options: { signal?: AbortSignal; label?: string; preferFallback?: boolean } = {},
): Promise<AiChatOutcome> {
  const label = options.label ?? "tobi";
  const gatewayKey = Deno.env.get("LOVABLE_API_KEY");
  const xaiKey = Deno.env.get("XAI_API_KEY");

  const post = async (url: string, key: string, payload: Record<string, unknown>) =>
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: options.signal,
    });

  const runFallback = async (reason: string): Promise<AiChatOutcome> => {
    if (!xaiKey) {
      const { code, error } = describeAiFailure(503, reason);
      return { ok: false, status: 503, provider: "gateway", code, error };
    }
    const gatewayModel = String(body.model ?? "");
    const model = XAI_EQUIVALENT[gatewayModel] ?? "grok-4-fast";
    console.log(`[${label}] standing by on TOBI reserve (${model}) after: ${reason.slice(0, 160)}`);
    try {
      const resp = await post(XAI_CHAT_URL, xaiKey, { ...body, model });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        console.error(`[${label}] reserve brain failed`, resp.status, detail.slice(0, 300));
        return {
          ok: false,
          status: resp.status,
          provider: "xai",
          code: "AI_ERROR",
          error: "TOBI is temporarily unavailable. Please try again shortly.",
        };
      }
      return { ok: true, status: 200, provider: "xai", data: await resp.json() };
    } catch (err) {
      return {
        ok: false,
        status: 502,
        provider: "xai",
        code: "AI_ERROR",
        error: err instanceof Error ? err.message : "TOBI request failed",
      };
    }
  };

  if (!gatewayKey) return await runFallback("LOVABLE_API_KEY missing");
  if (options.preferFallback) return await runFallback("fallback explicitly requested");

  let response: Response;
  try {
    response = await post(AI_GATEWAY_URL, gatewayKey, body);
  } catch (err) {
    return await runFallback(err instanceof Error ? err.message : "network error");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const { code, error } = describeAiFailure(response.status, detail);
    console.error(`[${label}] gateway ${response.status} ${code}`, detail.slice(0, 300));
    if (FALLBACK_WORTHY.includes(code)) {
      const viaReserve = await runFallback(`gateway ${response.status} ${code}`);
      if (viaReserve.ok) return viaReserve;
      return { ok: false, status: response.status, provider: "gateway", code, error };
    }
    return { ok: false, status: response.status, provider: "gateway", code, error };
  }

  return { ok: true, status: 200, provider: "gateway", data: await response.json() };
}

/**
 * Single entry point for gateway chat calls. Centralises auth, model selection
 * and the 402/429/403 handling that used to be duplicated in every function,
 * with automatic standby on the reserve brain.
 */
export async function callLovableAi(options: AiCallOptions): Promise<AiCallResult> {
  const body: Record<string, unknown> = {
    model: modelForTask(options.task),
    messages: options.messages,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options.responseFormat) body.response_format = options.responseFormat;
  if (options.tools) body.tools = options.tools;

  const outcome = await aiChat(body, { signal: options.signal, label: `ai:${options.task}` });
  if (!outcome.ok) {
    return { ok: false, content: null, status: outcome.status, code: outcome.code, error: outcome.error };
  }
  const result = outcome.data as Record<string, any>;
  const content = result?.choices?.[0]?.message?.content ?? null;
  return { ok: true, content, status: 200, raw: result };
}

/**
 * Drop-in replacement for `fetch(AI_GATEWAY_URL, init)` that stands by on the
 * reserve brain. Returns a normal Response with the usual OpenAI chat shape, so
 * existing call sites keep working unchanged (`resp.ok`, `resp.json()`).
 */
export async function aiFetch(
  _url: string,
  init: { body?: string; signal?: AbortSignal; headers?: Record<string, string> } & Record<string, unknown>,
  label = "tobi",
): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(String(init?.body ?? "{}"));
  } catch {
    body = {};
  }

  // Streaming callers (TOBI chat surfaces) need the raw SSE body passed through,
  // so buffering it into JSON is not an option — retry the stream on the reserve.
  if (body.stream === true) {
    const gatewayKey = Deno.env.get("LOVABLE_API_KEY");
    const xaiKey = Deno.env.get("XAI_API_KEY");
    const streamPost = (url: string, key: string, payload: Record<string, unknown>) =>
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: init?.signal,
      });

    if (gatewayKey) {
      try {
        const primary = await streamPost(AI_GATEWAY_URL, gatewayKey, body);
        if (primary.ok) return primary;
        const detail = await primary.text().catch(() => "");
        const { code, error } = describeAiFailure(primary.status, detail);
        console.error(`[${label}] streaming gateway ${primary.status} ${code}`, detail.slice(0, 300));
        if (xaiKey && FALLBACK_WORTHY.includes(code)) {
          const model = XAI_EQUIVALENT[String(body.model ?? "")] ?? "grok-4-fast";
          const reserve = await streamPost(XAI_CHAT_URL, xaiKey, { ...body, model });
          if (reserve.ok) return reserve;
        }
        return new Response(JSON.stringify({ error: { code, message: error } }), {
          status: primary.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error(`[${label}] streaming gateway transport error`, err);
      }
    }
    if (xaiKey) {
      const model = XAI_EQUIVALENT[String(body.model ?? "")] ?? "grok-4-fast";
      return await streamPost(XAI_CHAT_URL, xaiKey, { ...body, model });
    }
    return new Response(JSON.stringify({ error: { code: "MISSING_KEY", message: "TOBI is not configured." } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const outcome = await aiChat(body, { signal: init?.signal, label });
  if (outcome.ok) {
    return new Response(JSON.stringify(outcome.data ?? {}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: { code: outcome.code, message: outcome.error } }), {
    status: outcome.status || 502,
    headers: { "Content-Type": "application/json" },
  });
}
