// supabase/functions/chatbot-chat/index.ts
//
// AI assistant brain for KD-Ops platform.
//   - Groq (Llama 3.3 70B Versatile) for text-only conversations — fast, free.
//   - Gemini 1.5 Flash for vision (images) and document (PDF) inputs — free tier.
//   - Tavily Search for web lookups (Naira rates, news, etc.) — 1k/month free.
//   - Open ER API for FX rates — no key required.
//   - pgvector RAG retrieval from chatbot_knowledge for platform-specific answers.
//   - Per-user daily rate limiting via chatbot_usage.
//   - All responses cite their tool sources.
//
// Deploy: supabase functions deploy chatbot-chat --no-verify-jwt
//
// Secrets:
//   supabase secrets set GROQ_API_KEY=gsk_...
//   supabase secrets set GEMINI_API_KEY=AIza...
//   supabase secrets set TAVILY_API_KEY=tvly-...

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";

interface Attachment {
  name: string;
  mime_type: string;
  data_url: string; // base64 data URL
}

interface IncomingMessage {
  conversation_id?: string | null;
  message: string;
  attachments?: Attachment[];
  use_web_search?: boolean;
}

// ─── Tool: FX rate lookup (no key required) ─────────────────────────────────────────────────
async function getFxRate(base = "USD", target = "NGN"): Promise<string> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await res.json();
    const rate = data?.rates?.[target];
    if (!rate) return `Unable to fetch ${base}/${target} rate.`;
    return `1 ${base} = ${rate.toLocaleString()} ${target} (as of ${data.time_last_update_utc}, source: open.er-api.com)`;
  } catch {
    return "FX lookup failed.";
  }
}

// ─── Tool: Tavily web search (AI-optimised, 1k free/month) ─────────────────────────────────
async function tavilySearch(query: string, count = 5): Promise<string> {
  if (!TAVILY_API_KEY) return "Web search disabled (no API key configured).";
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        max_results: count,
        search_depth: "basic",
        include_answer: true,
      }),
    });
    if (!res.ok) return `Web search error: ${res.status}`;
    const data = await res.json();
    const lines: string[] = [];
    if (data?.answer) lines.push(`Summary: ${data.answer}\n`);
    const results = (data?.results ?? []).slice(0, count) as Array<
      { title: string; url: string; content: string }
    >;
    if (results.length === 0 && !data?.answer) return "No web results found.";
    results.forEach((r, i) => {
      lines.push(`[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`);
    });
    return lines.join("\n\n");
  } catch (err) {
    return `Web search failed: ${(err as Error).message}`;
  }
}

// ─── RAG: Fetch knowledge from pgvector via embedding similarity ───────────────────────────
async function embedQuery(text: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/embedding-001",
          content: { parts: [{ text }] },
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.embedding?.values ?? null;
  } catch {
    return null;
  }
}

// ─── Gemini call (images / PDFs) ────────────────────────────────────────────────────────────
async function callGemini(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  attachments: Attachment[],
  model: string,
): Promise<{ text: string; tokens_in: number; tokens_out: number }> {
  if (!GEMINI_API_KEY) throw new Error("Vision AI not configured. Please ask your admin to set the GEMINI_API_KEY secret in Supabase.");

  const parts: Array<Record<string, unknown>> = [];
  // Inline base64 attachments
  for (const att of attachments) {
    const base64 = att.data_url.split(",")[1] ?? att.data_url;
    parts.push({
      inline_data: { mime_type: att.mime_type, data: base64 },
    });
  }
  parts.push({ text: userMessage });

  // Gemini uses its own conversation format
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    },
  );
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`Gemini ${res.status}: ${errTxt}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    ?.join("") ?? "";
  const usage = data?.usageMetadata ?? {};
  return {
    text,
    tokens_in: usage.promptTokenCount ?? 0,
    tokens_out: usage.candidatesTokenCount ?? 0,
  };
}

// ─── Groq call (text-only, fast) ────────────────────────────────────────────────────────────
async function callGroq(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  model: string,
): Promise<{ text: string; tokens_in: number; tokens_out: number }> {
  if (!GROQ_API_KEY) throw new Error("AI service not configured. Please ask your admin to set the GROQ_API_KEY secret in Supabase.");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`Groq ${res.status}: ${errTxt}`);
  }
  const data = await res.json();
  return {
    text: data?.choices?.[0]?.message?.content ?? "",
    tokens_in: data?.usage?.prompt_tokens ?? 0,
    tokens_out: data?.usage?.completion_tokens ?? 0,
  };
}

// ─── Main handler ───────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for all DB operations and for validating the user JWT
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Validate the user JWT via the admin client (avoids anon-key interference)
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await adminClient.auth.getUser(token);
    const user = userData?.user;
    if (!user || authError) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session. Please log out and log back in." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: IncomingMessage = await req.json();
    if (!body.message?.trim() && (!body.attachments || body.attachments.length === 0)) {
      return new Response(JSON.stringify({ error: "Empty message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load profile + role
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", user.id)
      .single();
    const userRole = profile?.role ?? "driver";

    // Load bot config
    const { data: cfg } = await adminClient
      .from("chatbot_config")
      .select("*")
      .limit(1)
      .single();

    if (!cfg?.is_enabled) {
      return new Response(JSON.stringify({ error: "Assistant disabled by admin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await adminClient
      .from("chatbot_usage")
      .select("message_count")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .maybeSingle();
    const currentCount = usage?.message_count ?? 0;
    if (currentCount >= cfg.daily_message_limit) {
      return new Response(
        JSON.stringify({
          error: `Daily message limit reached (${cfg.daily_message_limit}). Try again tomorrow.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get-or-create conversation
    let convId = body.conversation_id;
    if (!convId) {
      const { data: newConv } = await adminClient
        .from("chatbot_conversations")
        .insert({
          user_id: user.id,
          title: body.message.slice(0, 60) || "New conversation",
        })
        .select("id")
        .single();
      convId = newConv?.id;
    }

    // Load conversation history (last 10 messages)
    const { data: historyRows } = await adminClient
      .from("chatbot_messages")
      .select("role, content")
      .eq("conversation_id", convId!)
      .order("created_at", { ascending: true })
      .limit(20);
    const history = (historyRows ?? []).map((r) => ({
      role: r.role,
      content: r.content,
    }));

    // ─── Build augmented context ──────────────────────────────────────────────────────────
    const toolsUsed: string[] = [];
    const contextChunks: string[] = [];

    // RAG: retrieve relevant knowledge
    const queryEmbed = await embedQuery(body.message);
    if (queryEmbed) {
      const { data: matches } = await adminClient.rpc("match_chatbot_knowledge", {
        query_embedding: queryEmbed,
        match_count: 5,
        user_role: userRole,
      });
      if (matches && matches.length > 0) {
        contextChunks.push(
          "PLATFORM KNOWLEDGE (cite these when relevant):\n" +
            (matches as Array<{ title: string; content: string; source: string | null }>)
              .map((m, i) =>
                `[KB-${i + 1}] ${m.title}${m.source ? ` (${m.source})` : ""}\n${m.content}`,
              )
              .join("\n\n"),
        );
        toolsUsed.push("knowledge_base");
      }
    }

    // Tool: FX rates — auto-trigger on naira/dollar/exchange keywords
    const lowerMsg = body.message.toLowerCase();
    if (
      cfg.enable_fx_rates &&
      /\b(usd|dollar|naira|exchange|fx|forex|gbp|pound|eur|euro)\b/.test(lowerMsg) &&
      /\b(rate|today|current|now|price)\b/.test(lowerMsg)
    ) {
      const usdNgn = await getFxRate("USD", "NGN");
      const gbpNgn = await getFxRate("GBP", "NGN");
      const eurNgn = await getFxRate("EUR", "NGN");
      contextChunks.push(
        `LIVE FX RATES:\n${usdNgn}\n${gbpNgn}\n${eurNgn}`,
      );
      toolsUsed.push("fx_rates");
    }

    // Tool: web search — explicit user request OR auto-trigger on news/today/latest
    const wantsSearch =
      cfg.enable_web_search &&
      (body.use_web_search === true ||
        /\b(latest|news|today|current|recent|happening|search|google|find online)\b/
          .test(lowerMsg));
    if (wantsSearch) {
      const results = await tavilySearch(body.message);
      contextChunks.push(`WEB SEARCH RESULTS:\n${results}`);
      toolsUsed.push("web_search");
    }

    // Compose final system prompt
    const userIdentity = `\n\nCURRENT USER: ${profile?.full_name ?? "Unknown"} (role: ${userRole}). Tailor your answer to their role and permissions.`;
    const dateLine = `\nCURRENT DATE: ${new Date().toISOString().slice(0, 10)}`;
    const finalSystemPrompt =
      cfg.system_prompt +
      userIdentity +
      dateLine +
      (contextChunks.length > 0 ? "\n\n" + contextChunks.join("\n\n") : "");

    // ─── Route to appropriate model ───────────────────────────────────────────────────────
    const hasAttachments = (body.attachments?.length ?? 0) > 0;
    const useVision = hasAttachments;
    const model = useVision ? cfg.vision_model : cfg.text_model;

    let result: { text: string; tokens_in: number; tokens_out: number };
    try {
      if (useVision) {
        result = await callGemini(
          finalSystemPrompt,
          history,
          body.message,
          body.attachments ?? [],
          cfg.vision_model,
        );
      } else {
        result = await callGroq(
          finalSystemPrompt,
          history,
          body.message,
          cfg.text_model,
        );
      }
    } catch (err) {
      // Fallback: if Groq fails, try Gemini
      if (!useVision) {
        result = await callGemini(
          finalSystemPrompt,
          history,
          body.message,
          [],
          cfg.vision_model,
        );
        toolsUsed.push("fallback_gemini");
      } else {
        throw err;
      }
    }

    // Guard: never persist an empty assistant response
    if (!result.text?.trim()) {
      throw new Error("The AI model returned an empty response. Please try again.");
    }

    // ─── Persist messages + bump usage ────────────────────────────────────────────────────
    await adminClient.from("chatbot_messages").insert([
      {
        conversation_id: convId,
        user_id: user.id,
        role: "user",
        content: body.message,
        attachments: (body.attachments ?? []).map((a) => ({
          name: a.name, mime_type: a.mime_type,
        })),
      },
      {
        conversation_id: convId,
        user_id: user.id,
        role: "assistant",
        content: result.text,
        tools_used: toolsUsed,
        model_used: model,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
      },
    ]);

    // Update conversation title if it's still the default
    if (history.length === 0) {
      await adminClient
        .from("chatbot_conversations")
        .update({ title: body.message.slice(0, 60) })
        .eq("id", convId!);
    }

    // Bump usage counter
    const newTokens = (usage?.message_count ? 0 : 0) + result.tokens_in + result.tokens_out;
    if (usage) {
      await adminClient.from("chatbot_usage")
        .update({
          message_count: currentCount + 1,
          tokens_total: result.tokens_in + result.tokens_out,
        })
        .eq("user_id", user.id)
        .eq("usage_date", today);
    } else {
      await adminClient.from("chatbot_usage").insert({
        user_id: user.id,
        usage_date: today,
        message_count: 1,
        tokens_total: newTokens,
      });
    }

    return new Response(
      JSON.stringify({
        conversation_id: convId,
        reply: result.text,
        tools_used: toolsUsed,
        model_used: model,
        tokens: result.tokens_in + result.tokens_out,
        messages_used_today: currentCount + 1,
        daily_limit: cfg.daily_message_limit,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    console.error("chatbot-chat error:", msg);
    // Return 200 so the client receives the error body instead of the generic
    // "Edge Function returned a non-2xx status code" wrapper message.
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
