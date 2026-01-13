import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are TOBI, a friendly cat-themed AI assistant for Rooms Online (ROL) - a luxury accommodation booking platform.
Your personality is helpful, warm, and occasionally playful with subtle cat references.

Guidelines:
- Answer questions based on the help documentation provided below
- If you're unsure or the documentation doesn't cover a topic, suggest the user contact support@roomsonline.co.za
- Keep responses concise but complete (2-4 sentences unless more detail is needed)
- Suggest relevant help articles when appropriate using format: "📖 See: [Article Title]"
- Use a friendly, professional tone
- You can use emoji sparingly (1-2 per response max, cat-themed when appropriate 🐱)
- Never make up features or capabilities not in the documentation
- If asked about technical details you don't know, be honest and redirect to support

Remember: You're here to help users navigate the ROL platform efficiently!`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userRole } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Fetch help articles for context
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get relevant help articles based on user role
    let query = supabase
      .from("help_articles")
      .select("title, section, content_markdown, slug")
      .eq("is_published", true)
      .order("section")
      .limit(50);

    // Filter by role if not admin/dev
    if (userRole && !["admin", "dev"].includes(userRole)) {
      query = query.or(`role_target.cs.{${userRole}},role_target.cs.{all}`);
    }

    const { data: articles, error } = await query;

    if (error) {
      console.error("Error fetching help articles:", error);
    }

    // Build context from help articles
    let helpContext = "HELP DOCUMENTATION:\n\n";
    if (articles && articles.length > 0) {
      for (const article of articles) {
        helpContext += `## ${article.title} (Section: ${article.section})\n`;
        helpContext += `${article.content_markdown.substring(0, 1000)}...\n\n`;
      }
    } else {
      helpContext += "No help articles available.\n";
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { 
            role: "system", 
            content: `${SYSTEM_PROMPT}\n\n${helpContext}` 
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "I'm getting a lot of questions right now! 🐱 Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "TOBI needs a little rest. Please try again later or contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Something went wrong. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("help-assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
