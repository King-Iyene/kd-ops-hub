// supabase/functions/chatbot-embed/index.ts
//
// Indexes chatbot_knowledge entries for retrieval.
// Uses PostgreSQL full-text search (tsvector GENERATED ALWAYS AS column) —
// no external embedding API required.
//
// Deploy: supabase functions deploy chatbot-embed --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await adminClient.auth.getUser(token);
    if (!userData?.user || authError) {
      return json({ error: "Invalid or expired session. Please log out and back in." }, 401);
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profile?.role !== "super_admin") {
      return json({ error: "Super admin access required." }, 403);
    }

    const body = await req.json();
    const { knowledge_id, all } = body as { knowledge_id?: string; all?: boolean };

    // ── Bulk index: tsvector is GENERATED ALWAYS AS STORED, so every row
    //   is already indexed by Postgres the moment it is inserted or updated.
    //   We just count and confirm.
    if (all) {
      const { count, error: countErr } = await adminClient
        .from("chatbot_knowledge")
        .select("id", { count: "exact", head: true });

      if (countErr) return json({ error: "Failed to count rows." }, 500);

      return json({ embedded: count ?? 0, failed: 0 });
    }

    // ── Single row: touch the row so Postgres refreshes the generated column
    if (!knowledge_id) {
      return json({ error: "Provide knowledge_id or all: true." }, 400);
    }

    const { data: row, error: rowErr } = await adminClient
      .from("chatbot_knowledge")
      .select("id, title")
      .eq("id", knowledge_id)
      .single();

    if (rowErr || !row) {
      return json({ error: "Knowledge entry not found." }, 404);
    }

    // Touch the row to ensure the generated tsvector is current
    await adminClient
      .from("chatbot_knowledge")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", knowledge_id);

    return json({ ok: true });

  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    console.error("chatbot-embed error:", msg);
    return json({ error: "Something went wrong." }, 500);
  }
});
