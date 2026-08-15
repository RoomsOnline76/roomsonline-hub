---
name: TOBI Reserve Brain Fallback
description: Lovable AI Gateway is primary; xAI/Grok is the automatic standby when the gateway is spend-capped, out of credits, rate limited or down
type: feature
---

Every TOBI edge function calls AI through `supabase/functions/_shared/aiModels.ts`:

- `callLovableAi(...)` — JSON/one-shot calls.
- `aiChat(body, { label, preferFallback })` — lower level, returns `{ ok, provider, data }`.
- `aiFetch(AI_GATEWAY_URL, init, label)` — drop-in for `fetch(...)` at existing call sites; returns a normal OpenAI-shaped `Response`, and passes SSE through untouched when `body.stream === true`.

Never call `https://ai.gateway.lovable.dev` with a raw `fetch` in a function — use one of the three above so the standby applies.

**Standby rules**
- Primary: Lovable AI Gateway with the model from `AI_MODELS` (never hardcode a model).
- Standby: xAI (`XAI_API_KEY`, `https://api.x.ai/v1/chat/completions`) fires automatically when the gateway returns `SPEND_LIMIT_REACHED` (403 credit_limit_reached), `CREDITS_EXHAUSTED` (402), `RATE_LIMITED` (429) or a transport/`AI_ERROR` failure. Auth/validation failures are terminal — no retry.
- Gateway model → Grok equivalent map lives in `XAI_EQUIVALENT` (extract → grok-3-mini, chat/prose → grok-4-fast, vision → grok-4).
- If the standby also fails, the original gateway error/code is surfaced so the owner sees the real reason.
- Branding: never name the gateway, xAI, Grok or Gemini in UI copy or logs shown to users — it is all TOBI. Internal logs say "reserve brain".
