// supabase/functions/chatbot-embed/index.ts
//
// Embeds a chatbot_knowledge row using Gemini text-embedding-004 (768 dims, free).
// Called by super admin from the AssistantAdmin page after creating/editing a doc.
//
// Deploy: supabase functions deploy chatbot-embed --no-verify-jwt
//
// Payload: { knowledge_id: uuid } | { all: true }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

// Gemini text-embedding-004 has a ~2048-token limit; truncate to ~7500 chars to be safe.
const MAX_TEXT_CHARS = 7500;

function truncate(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

async function embed(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured. Set it in Supabase secrets.");
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: truncate(text) }] },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embed ${res.status}: ${body}`);
  }
  const data = await res.json();
  const values: number[] = data?.embedding?.values ?? [];
  if (values.length === 0) {
    throw new Error("Gemini returned empty embedding — check your GEMINI_API_KEY.");
  }
  return values;
}

// PostgREST requires vectors as a JSON array of numbers (not a string).
// Pass the number[] directly — Supabase JS v2 + PostgREST 11+ handles the cast.
async function updateEmbedding(
  adminClient: ReturnType<typeof createClient>,
  id: string,
  embedding: number[],
): Promise<void> {
  const { error } = await adminClient
    .from("chatbot_knowledge")
    .update({ embedding })
    .eq("id", id);
  if (error) throw new Error(`DB update failed for ${id}: ${error.message}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Always return 200 so the client receives the error body instead of the
  // generic "Edge Function returned a non-2xx status code" wrapper.
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return ok({ error: "Missing Authorization header." });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Validate the user JWT via admin client (not anon client — avoids interference)
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await adminClient.auth.getUser(token);
    if (!userData?.user || authError) {
      return ok({ error: "Invalid or expired session. Please log out and back in." });
    }

    // Role check — super_admin only
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profile?.role !== "super_admin") {
      return ok({ error: "Super admin access required." });
    }

    const body = await req.json();
    const { knowledge_id, all } = body as { knowledge_id?: string; all?: boolean };

    // ── Bulk embed all unembedded entries ─────────────────────────────────────
    if (all) {
      const { data: rows, error: fetchErr } = await adminClient
        .from("chatbot_knowledge")
        .select("id, title, content")
        .is("embedding", null);

      if (fetchErr) return ok({ error: `Failed to fetch rows: ${fetchErr.message}` });

      const rowList = rows ?? [];
      let success = 0;
      const errors: string[] = [];

      for (const r of rowList) {
        try {
          const emb = await embed(`${r.title}\n\n${r.content}`);
          await updateEmbedding(adminClient, r.id, emb);
          success++;
        } catch (rowErr) {
          errors.push(`Row "${r.title}": ${(rowErr as Error).message}`);
          console.error("embed row error:", r.id, (rowErr as Error).message);
        }
      }

      // When everything fails, surface the first error as the top-level message
      // so AssistantAdmin's data?.error check can display it directly.
      return ok({
        embedded: success,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        error: success === 0 && errors.length > 0 ? errors[0] : undefined,
      });
    }

    // ── Single row embed ───────────────────────────────────────────────────────
    if (!knowledge_id) {
      return ok({ error: "Provide knowledge_id or all: true." });
    }

    const { data: row, error: rowErr } = await adminClient
      .from("chatbot_knowledge")
      .select("id, title, content")
      .eq("id", knowledge_id)
      .single();

    if (rowErr || !row) {
      return ok({ error: `Knowledge entry not found: ${rowErr?.message ?? knowledge_id}` });
    }

    const emb = await embed(`${row.title}\n\n${row.content}`);
    await updateEmbedding(adminClient, row.id, emb);

    return ok({ ok: true, dims: emb.length });

  } catch (err) {
    // Catch-all — return 200 so the real message reaches the browser
    const msg = (err as Error).message ?? "Unknown error";
    console.error("chatbot-embed error:", msg);
    return ok({ error: msg });
  }
});
