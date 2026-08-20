// supabase/functions/extract-receipt/index.ts
//
// Primary receipt OCR via Google Document AI's Expense Parser.
// Called by OcrReceiptScanner on every receipt scan — this is the
// sole OCR path; there is no in-browser fallback.
//
// Deploy: supabase functions deploy extract-receipt --no-verify-jwt
//
// Secrets (required):
//   supabase secrets set GOOGLE_DOC_AI_API_KEY=...
//   supabase secrets set GOOGLE_DOC_AI_PROJECT_ID=...
//   supabase secrets set GOOGLE_DOC_AI_PROCESSOR_ID=...
//   supabase secrets set GOOGLE_DOC_AI_LOCATION=us   (or eu)
//
// Payload: { image_base64: string, mime_type: string }
// Response: { ok, amount_ngn, date, vendor, litres, receipt_type,
//             currency, line_items, confidence, raw_text }

import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

let corsHeaders: Record<string, string> = {};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Entity extraction helpers
// ---------------------------------------------------------------------------

interface DocAiEntity {
  type: string;
  mentionText?: string;
  confidence?: number;
  normalizedValue?: {
    text?: string;
    moneyValue?: { currencyCode?: string; units?: string; nanos?: number };
    dateValue?: { year?: number; month?: number; day?: number };
  };
  properties?: DocAiEntity[];
}

function findEntity(
  entities: DocAiEntity[],
  type: string,
): DocAiEntity | undefined {
  return entities.find((e) => e.type === type);
}

function findAllEntities(
  entities: DocAiEntity[],
  type: string,
): DocAiEntity[] {
  return entities.filter((e) => e.type === type);
}

function extractMoney(entity: DocAiEntity | undefined): string | undefined {
  if (!entity) return undefined;
  const mv = entity.normalizedValue?.moneyValue;
  if (mv?.units) {
    const nanos = mv.nanos ?? 0;
    const decimal = nanos > 0 ? nanos / 1_000_000_000 : 0;
    const total = parseFloat(mv.units) + decimal;
    return String(Math.round(total));
  }
  const text =
    entity.normalizedValue?.text ?? entity.mentionText ?? undefined;
  if (!text) return undefined;
  const cleaned = text.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return !isNaN(n) && n > 0 ? String(Math.round(n)) : undefined;
}

function extractDate(entity: DocAiEntity | undefined): string | undefined {
  if (!entity) return undefined;
  const dv = entity.normalizedValue?.dateValue;
  if (dv?.year && dv?.month && dv?.day) {
    const y = String(dv.year);
    const m = String(dv.month).padStart(2, "0");
    const d = String(dv.day).padStart(2, "0");
    if (parseInt(m) >= 1 && parseInt(m) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }
  const text =
    entity.normalizedValue?.text ?? entity.mentionText ?? undefined;
  if (!text) return undefined;
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  const slashMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    const month = parseInt(mm);
    const day = parseInt(dd);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }
  return undefined;
}

function extractText(entity: DocAiEntity | undefined): string | undefined {
  if (!entity) return undefined;
  return (
    entity.normalizedValue?.text?.trim() ||
    entity.mentionText?.trim() ||
    undefined
  );
}

function extractCurrency(entities: DocAiEntity[]): string | undefined {
  const totalEntity = findEntity(entities, "total_amount");
  const code = totalEntity?.normalizedValue?.moneyValue?.currencyCode;
  if (code) return code;
  const currEntity = findEntity(entities, "currency");
  if (currEntity) return extractText(currEntity);
  return undefined;
}

function extractLitres(entities: DocAiEntity[]): string | undefined {
  const lineItems = findAllEntities(entities, "line_item");
  for (const item of lineItems) {
    const props = item.properties ?? [];
    const qty = findEntity(props, "line_item/quantity");
    const desc = findEntity(props, "line_item/description");
    const descText = extractText(desc)?.toLowerCase() ?? "";
    const qtyText = extractText(qty);
    if (
      qtyText &&
      (descText.includes("litre") ||
        descText.includes("liter") ||
        descText.includes("ltr") ||
        descText.includes("fuel") ||
        descText.includes("petrol") ||
        descText.includes("diesel") ||
        descText.includes("pms") ||
        descText.includes("ago"))
    ) {
      const n = parseFloat(qtyText.replace(/[^0-9.]/g, ""));
      if (!isNaN(n) && n > 0 && n < 2000) return String(n);
    }
  }
  for (const item of lineItems) {
    const props = item.properties ?? [];
    const qty = findEntity(props, "line_item/quantity");
    const qtyText = extractText(qty);
    if (qtyText) {
      const n = parseFloat(qtyText.replace(/[^0-9.]/g, ""));
      if (!isNaN(n) && n > 0 && n < 2000) return String(n);
    }
  }
  return undefined;
}

type ReceiptType = "fuel" | "repair" | "parts" | "general";

function detectReceiptType(
  entities: DocAiEntity[],
  rawText: string,
): ReceiptType {
  const vendor = (extractText(findEntity(entities, "supplier_name")) ?? "").toLowerCase();
  const lower = rawText.toLowerCase();
  const fuelKeywords = [
    "fuel", "petrol", "diesel", "filling", "station", "pump", "pms",
    "ago", "dpk", "litre", "liter", "nozzle", "dispenser", "nnpc",
    "mobil", "total energies", "ardova", "conoil", "oando",
  ];
  if (fuelKeywords.some((kw) => lower.includes(kw) || vendor.includes(kw))) {
    return "fuel";
  }
  const repairKeywords = [
    "repair", "service", "maintenance", "mechanic", "workshop",
    "labour", "labor", "diagnostic", "alignment", "overhaul",
    "engine", "transmission", "brake pad", "oil change",
  ];
  if (repairKeywords.some((kw) => lower.includes(kw) || vendor.includes(kw))) {
    return "repair";
  }
  const partsKeywords = [
    "spare", "part", "tyre", "tire", "battery", "filter", "belt",
    "bearing", "gasket", "plug", "bolt", "nut", "washer",
  ];
  if (partsKeywords.some((kw) => lower.includes(kw) || vendor.includes(kw))) {
    return "parts";
  }
  return "general";
}

interface LineItem {
  description: string;
  amount?: string;
  quantity?: string;
}

function extractLineItems(entities: DocAiEntity[]): LineItem[] {
  const items: LineItem[] = [];
  for (const item of findAllEntities(entities, "line_item")) {
    const props = item.properties ?? [];
    const desc = extractText(findEntity(props, "line_item/description"));
    if (!desc) continue;
    const amt = extractMoney(findEntity(props, "line_item/amount"));
    const qty = extractText(findEntity(props, "line_item/quantity"));
    items.push({ description: desc, amount: amt, quantity: qty });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth guard — require a valid JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    if (!bearer) {
      return json({ ok: false, error: "Missing Authorization header" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !user) {
      return json({ ok: false, error: authError?.message || "Not authenticated" }, 401);
    }

    // Rate limit: max 30 OCR scans per user per 60 seconds. This is a paid,
    // per-call external API (Google Document AI) with no cap otherwise — any
    // authenticated user could run up billing/quota by repeatedly calling
    // this function. Mirrors send-email's identical audit-log-based limiter.
    try {
      const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await service
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("action", "extract_receipt")
        .gte("created_at", since);
      if ((count ?? 0) >= 30) {
        return json({ ok: false, error: "Rate limit exceeded — max 30 receipt scans per minute" }, 429);
      }
      await service.from("audit_logs").insert({
        user_id: user.id,
        action: "extract_receipt",
        table_name: "receipts",
      });
    } catch (_) {
      // Fail open — don't block a legitimate scan on rate-limit check failure.
    }

    const apiKey = Deno.env.get("GOOGLE_DOC_AI_API_KEY");
    const projectId = Deno.env.get("GOOGLE_DOC_AI_PROJECT_ID");
    const processorId = Deno.env.get("GOOGLE_DOC_AI_PROCESSOR_ID");
    const location = Deno.env.get("GOOGLE_DOC_AI_LOCATION") ?? "us";

    if (!apiKey || !projectId || !processorId) {
      return json({ ok: true, dev_skip: true });
    }

    const body = await req.json();
    const { image_base64, mime_type } = body;

    if (!image_base64 || !mime_type) {
      return json(
        { ok: false, error: "image_base64 and mime_type are required" },
        400,
      );
    }

    const rawBytes = Uint8Array.from(atob(image_base64), (c) =>
      c.charCodeAt(0),
    );
    if (rawBytes.length > 10 * 1024 * 1024) {
      return json({ ok: false, error: "Image exceeds 10 MB limit" }, 400);
    }

    const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        rawDocument: { content: image_base64, mimeType: mime_type },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const rawText = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("[extract-receipt] Document AI non-JSON:", rawText.slice(0, 500));
      return json({
        ok: false,
        error: "Receipt processing failed. Please try again.",
      });
    }

    if (!res.ok) {
      const errData = data as { error?: { message?: string } };
      return json({
        ok: false,
        error:
          errData?.error?.message ??
          `Document AI error (HTTP ${res.status})`,
      });
    }

    const document = data?.document as
      | { entities?: DocAiEntity[]; text?: string }
      | undefined;
    const entities: DocAiEntity[] = (document?.entities as DocAiEntity[]) ?? [];
    const fullText = (document?.text as string) ?? "";

    const totalEntity = findEntity(entities, "total_amount");
    const dateEntity = findEntity(entities, "receipt_date");
    const vendorEntity = findEntity(entities, "supplier_name");

    const amount_ngn = extractMoney(totalEntity);
    const date = extractDate(dateEntity);
    const vendor = extractText(vendorEntity);
    const litres = extractLitres(entities);
    const currency = extractCurrency(entities) ?? "NGN";
    const receipt_type = detectReceiptType(entities, fullText);
    const line_items = extractLineItems(entities);

    const confidence: Record<string, number | undefined> = {
      amount: totalEntity?.confidence,
      date: dateEntity?.confidence,
      vendor: vendorEntity?.confidence,
    };

    const confValues = Object.values(confidence).filter(
      (v): v is number => v != null,
    );
    if (confValues.length > 0) {
      confidence.overall =
        Math.round(
          (confValues.reduce((a, b) => a + b, 0) / confValues.length) * 100,
        ) / 100;
    }

    return json({
      ok: true,
      amount_ngn,
      date,
      vendor,
      litres,
      currency,
      receipt_type,
      line_items: line_items.length > 0 ? line_items : undefined,
      confidence,
      raw_text: fullText.slice(0, 2000),
    });
  } catch (err) {
    console.error("[extract-receipt]", err);
    return json({ ok: false, error: "Receipt extraction failed. Please try again." }, 500);
  }
});
