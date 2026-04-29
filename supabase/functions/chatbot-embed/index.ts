// supabase/functions/chatbot-embed/index.ts
//
// Embeds a chatbot_knowledge row using Gemini text-embedding-004 (768 dims, free).
// Called by super admin from the AssistantAdmin page after creating/editing a doc.
//
// Deploy: supabase functions deploy chatbot-embed --no-verify-jwt
//
// Payload: { knowledge_id: uuid }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.embedding?.values ?? [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await adminClient.auth.getUser(token);
    if (!userData?.user || authError) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await adminClient
      .from("profiles").select("role").eq("id", userData.user.id).single();
    if (profile?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Super admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { knowledge_id, all } = await req.json();

    if (all) {
      // Re-embed everything missing an embedding
      const { data: rows } = await adminClient
        .from("chatbot_knowledge")
        .select("id, title, content")
        .is("embedding", null);
      let count = 0;
      for (const r of rows ?? []) {
        const emb = await embed(`${r.title}\n\n${r.content}`);
        await adminClient
          .from("chatbot_knowledge")
          .update({ embedding: emb })
          .eq("id", r.id);
        count++;
      }
      return new Response(JSON.stringify({ embedded: count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!knowledge_id) {
      return new Response(JSON.stringify({ error: "knowledge_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row } = await adminClient
      .from("chatbot_knowledge")
      .select("id, title, content")
      .eq("id", knowledge_id)
      .single();
    if (!row) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emb = await embed(`${row.title}\n\n${row.content}`);
    await adminClient
      .from("chatbot_knowledge")
      .update({ embedding: emb })
      .eq("id", row.id);

    return new Response(JSON.stringify({ ok: true, dims: emb.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
