// supabase/functions/extract-receipt/index.ts
//
// Fallback OCR for receipts the on-device Tesseract.js scanner
// (src/components/OcrReceiptScanner.tsx) couldn't read confidently —
// crumpled thermal paper, faded ink, bad lighting. Calls Google
// Document AI's Expense Parser, which is materially more accurate than
// Tesseract on messy real-world receipts.
//
// DORMANT BY DESIGN: this function is deployed but not called by the
// client yet. Wiring it in is a follow-up — it needs a Google Cloud
// project with Document AI enabled and a processor created, which is an
// external setup step outside this codebase. Until GOOGLE_DOC_AI_* secrets
// are set, every call returns { ok: true, dev_skip: true }, exactly like
// send-email does when RESEND_API_KEY / TERMII_API_KEY are unset.
//
// Deploy: supabase functions deploy extract-receipt --no-verify-jwt
//
// Secrets (set only when ready to go live):
//   supabase secrets set GOOGLE_DOC_AI_API_KEY=...
//   supabase secrets set GOOGLE_DOC_AI_PROJECT_ID=...
//   supabase secrets set GOOGLE_DOC_AI_PROCESSOR_ID=...
//   supabase secrets set GOOGLE_DOC_AI_LOCATION=us   (or eu)
//
// Payload: { image_base64: string, mime_type: string }
// Response: { ok: true, dev_skip?: true, amount_ngn?, date?, vendor?, litres? }
//
// Cost note: Google Document AI's free tier covers 1,000 pages/month —
// comfortably above this firm's fleet receipt volume, so this stays free
// unless usage grows substantially. See the free-tier terms at
// cloud.google.com/document-ai/pricing before relying on that long-term.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractField(entities: any[], type: string): string | undefined {
  const e = entities?.find((x: any) => x.type === type);
  return e?.normalizedValue?.text ?? e?.mentionText ?? undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_DOC_AI_API_KEY");
    const projectId = Deno.env.get("GOOGLE_DOC_AI_PROJECT_ID");
    const processorId = Deno.env.get("GOOGLE_DOC_AI_PROCESSOR_ID");
    const location = Deno.env.get("GOOGLE_DOC_AI_LOCATION") ?? "us";

    if (!apiKey || !projectId || !processorId) {
      console.warn("[extract-receipt] Google Document AI not configured — skipping (dev_skip).");
      return new Response(
        JSON.stringify({ ok: true, dev_skip: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { image_base64, mime_type } = body;
    if (!image_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ ok: false, error: "image_base64 and mime_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawDocument: { content: image_base64, mimeType: mime_type },
      }),
    });

    const rawText = await res.text();
    let data: any;
    try { data = JSON.parse(rawText); } catch {
      return new Response(
        JSON.stringify({ ok: false, error: `Document AI non-JSON response (HTTP ${res.status})`, raw: rawText.slice(0, 400) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: data?.error?.message ?? `Document AI error (HTTP ${res.status})`, raw: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const entities = data?.document?.entities ?? [];
    return new Response(
      JSON.stringify({
        ok: true,
        amount_ngn: extractField(entities, "total_amount"),
        date: extractField(entities, "receipt_date"),
        vendor: extractField(entities, "supplier_name"),
        litres: extractField(entities, "line_item/quantity"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
