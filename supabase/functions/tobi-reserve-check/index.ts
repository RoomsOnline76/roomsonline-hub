import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AI_MODELS, aiChat } from "../_shared/aiModels.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const outcome = await aiChat(
    {
      model: AI_MODELS.help_assistant,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      max_tokens: 20,
    },
    { label: "tobi:reserve-check", preferFallback: true },
  );

  const data = outcome.data as Record<string, any> | undefined;
  return new Response(
    JSON.stringify({
      ok: outcome.ok,
      provider: outcome.provider,
      status: outcome.status,
      code: outcome.code,
      error: outcome.error,
      content: data?.choices?.[0]?.message?.content ?? null,
      model: data?.model ?? null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
