// supabase/functions/fleet-alerts/index.ts
//
// Fleet smart-alert Edge Function.
//
// Deploy:
//   supabase functions deploy fleet-alerts --no-verify-jwt
//
// Triggered from the browser after:
//   a) Fuel request approval   → { event: 'fuel_approved', vehicle_id, request_id }
//   b) Trip end                → { event: 'trip_ended',   vehicle_id }
//
// The Monday weekly digest is NOT triggered here — it is driven by pg_cron
// calling public.fleet_weekly_digest() directly (see weekly-digest-cron.sql).
//
// All writes to notifications use the service-role key (bypasses RLS).
// Invocations are best-effort: the browser awaits the call but any error
// inside the function is swallowed so it never breaks the caller.
//
// ALERT 1 — Budget 80% used (dedup: once per vehicle per week)
// ALERT 2 — Budget 100% exhausted (dedup: once per vehicle per week)
// ALERT 3 — Fuel level at or below 25% (dedup: once per vehicle per 24 h)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── helpers ─────────────────────────────────────────────────────────────────

/** ISO string for this week's Monday at 00:00:00.000Z */
function thisWeekMondayUtc(): string {
  const now = new Date();
  // getUTCDay(): 0=Sun,1=Mon,…,6=Sat  →  (day+6)%7 gives 0=Mon offset
  const dayOffset = (now.getUTCDay() + 6) % 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - dayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

/** ISO string for 24 hours ago */
function oneDayAgo(): string {
  return new Date(Date.now() - 86_400_000).toISOString();
}

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Check whether a notification of this type mentioning this vehicle plate
 * was already sent to `sampleUserId` after `since`.  Used for deduplication.
 */
async function alreadyNotified(
  db: SupabaseClient,
  sampleUserId: string,
  type: string,
  plate: string,
  since: string,
): Promise<boolean> {
  const { data } = await db
    .from("notifications")
    .select("id")
    .eq("user_id", sampleUserId)
    .eq("type", type)
    .ilike("body", `%${plate}%`)
    .gte("created_at", since)
    .limit(1);
  return (data ?? []).length > 0;
}

/** Insert one notification row per admin/finance user. */
async function notifyAdmins(
  db: SupabaseClient,
  opts: {
    type: string;
    title: string;
    body: string;
    priority?: string;
  },
): Promise<string[]> {
  const { data: admins } = await db
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin", "finance", "operations"])
    .eq("status", "active");

  if (!admins || admins.length === 0) return [];

  const rows = admins.map((u: { id: string }) => ({
    user_id: u.id,
    type: opts.type,
    module: "fleet",
    priority: opts.priority ?? "normal",
    title: opts.title,
    body: opts.body,
  }));

  await db.from("notifications").insert(rows);
  return admins.map((u: { id: string }) => u.id);
}

// ── alert handlers ───────────────────────────────────────────────────────────

/**
 * ALERT 1 & 2 — Weekly budget thresholds.
 * Called after a fuel request is approved.
 */
async function handleBudgetAlerts(
  db: SupabaseClient,
  vehicleId: string,
): Promise<void> {
  // Fetch vehicle info
  const { data: vehicle } = await db
    .from("vehicles")
    .select("id, plate_number, weekly_budget_ngn")
    .eq("id", vehicleId)
    .single();

  if (!vehicle || !vehicle.weekly_budget_ngn || vehicle.weekly_budget_ngn <= 0) {
    return; // no budget configured — nothing to check
  }

  const plate: string = vehicle.plate_number;
  const budget: number = vehicle.weekly_budget_ngn;
  const weekStart = thisWeekMondayUtc();

  // Sum all approved/paid fuel_requests for this vehicle this week
  const { data: reqs } = await db
    .from("fuel_requests")
    .select("amount_ngn")
    .eq("vehicle_id", vehicleId)
    .in("status", ["approved", "payment_sent", "receipt_uploaded", "completed"])
    .gte("created_at", weekStart);

  const spent = (reqs ?? []).reduce(
    (sum: number, r: { amount_ngn: number }) => sum + (r.amount_ngn ?? 0),
    0,
  );
  const ratio = spent / budget;

  // Get a sample admin ID for dedup check
  const { data: sampleAdmin } = await db
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin", "finance", "operations"])
    .eq("status", "active")
    .limit(1)
    .single();

  if (!sampleAdmin) return;

  if (ratio >= 1.0) {
    // ALERT 2 — exhausted (dedup: once per week)
    const already = await alreadyNotified(
      db, sampleAdmin.id, "fleet_budget_exhausted", plate, weekStart,
    );
    if (!already) {
      const ngn = (n: number) =>
        "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 0 });
      await notifyAdmins(db, {
        type: "fleet_budget_exhausted",
        priority: "high",
        title: `🚨 ${plate} weekly fuel budget exhausted`,
        body: `${plate} has used 100% of its weekly fuel budget (${ngn(spent)} of ${ngn(budget)}). Further requests will be blocked until reset on Monday.`,
      });
    }
  } else if (ratio >= 0.8) {
    // ALERT 1 — 80% warning (dedup: once per week)
    const already = await alreadyNotified(
      db, sampleAdmin.id, "fleet_budget_80pct", plate, weekStart,
    );
    if (!already) {
      const ngn = (n: number) =>
        "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 0 });
      await notifyAdmins(db, {
        type: "fleet_budget_80pct",
        priority: "normal",
        title: `⚠️ ${plate} fuel budget at 80%`,
        body: `${plate} has used 80% of its weekly fuel budget (${ngn(spent)} of ${ngn(budget)}).`,
      });
    }
  }
}

/**
 * ALERT 3 — Fuel level at or below 25%.
 * Called after a trip ends and the fuel balance has been recalculated.
 */
async function handleFuelLevelAlert(
  db: SupabaseClient,
  vehicleId: string,
): Promise<void> {
  const { data: vehicle } = await db
    .from("vehicles")
    .select("id, plate_number, tank_capacity_litres, current_fuel_litres")
    .eq("id", vehicleId)
    .single();

  if (!vehicle || !vehicle.tank_capacity_litres) return;

  const plate: string = vehicle.plate_number;
  const capacity: number = vehicle.tank_capacity_litres;
  const current: number = vehicle.current_fuel_litres ?? 0;
  const ratio = current / capacity;

  if (ratio > 0.25) return; // level is fine

  // Get a sample admin for dedup check
  const { data: sampleAdmin } = await db
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin", "finance", "operations"])
    .eq("status", "active")
    .limit(1)
    .single();

  if (!sampleAdmin) return;

  // Dedup: skip if already notified in the last 24 h
  const already = await alreadyNotified(
    db, sampleAdmin.id, "fleet_fuel_low", plate, oneDayAgo(),
  );
  if (already) return;

  const litresStr = current.toFixed(1);
  const pctStr = Math.round(ratio * 100).toString();

  await notifyAdmins(db, {
    type: "fleet_fuel_low",
    priority: "normal",
    title: `⛽ ${plate} fuel level at ${pctStr}%`,
    body: `${plate} fuel level is at ${pctStr}% (${litresStr} litres remaining). Consider scheduling a refuel soon.`,
  });
}

/**
 * ALERT 4 — Compliance document expiry reminders.
 * Scans all vehicles for insurance, road worthiness, hackney permit, and
 * vehicle license expiry. Sends escalating reminders at 30, 14, 7, 1, and
 * 0 (expired) day thresholds. Dedup via compliance_reminders table.
 *
 * Intended to be called daily by pg_cron or an external scheduler:
 *   { event: 'compliance_check' }
 */
async function handleComplianceCheck(db: SupabaseClient): Promise<number> {
  const THRESHOLDS = [30, 14, 7, 1, 0];
  const DOC_FIELDS: { field: string; label: string }[] = [
    { field: "insurance_expiry", label: "Insurance" },
    { field: "road_worthiness_expiry", label: "Road Worthiness" },
    { field: "hackney_permit_expiry", label: "Hackney Permit" },
    { field: "vehicle_license_expiry", label: "Vehicle License" },
  ];

  const { data: vehicles } = await db
    .from("vehicles")
    .select("id, name, plate_number, insurance_expiry, road_worthiness_expiry, hackney_permit_expiry, vehicle_license_expiry");

  if (!vehicles || vehicles.length === 0) return 0;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let alertsSent = 0;

  for (const v of vehicles) {
    for (const doc of DOC_FIELDS) {
      const expiryStr = (v as Record<string, unknown>)[doc.field] as string | null;
      if (!expiryStr) continue;

      const expiry = new Date(expiryStr + "T00:00:00Z");
      const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

      for (const threshold of THRESHOLDS) {
        if (daysLeft > threshold) continue;

        const { data: existing } = await db
          .from("compliance_reminders")
          .select("id")
          .eq("vehicle_id", v.id)
          .eq("document_type", doc.field)
          .eq("threshold_days", threshold)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const isExpired = daysLeft <= 0;
        const priority = isExpired || threshold <= 7 ? "high" : "normal";
        const plate = v.plate_number || v.name;
        const title = isExpired
          ? `🚨 ${plate} ${doc.label} EXPIRED`
          : `⚠️ ${plate} ${doc.label} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
        const body = isExpired
          ? `${plate}'s ${doc.label} expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago. Fuel requests are blocked until renewed.`
          : `${plate}'s ${doc.label} expires on ${expiryStr}. Renew to avoid service disruption.`;

        await notifyAdmins(db, {
          type: "fleet_compliance_expiry",
          priority,
          title,
          body,
        });

        await db.from("compliance_reminders").insert({
          vehicle_id: v.id,
          document_type: doc.field,
          threshold_days: threshold,
        });

        alertsSent++;
        break;
      }
    }
  }
  return alertsSent;
}

/**
 * ALERT 5 — Overdue maintenance reminders.
 * Notifies admins about vehicles with overdue maintenance items.
 * Dedup: once per vehicle per day per overdue item.
 */
async function handleMaintenanceCheck(db: SupabaseClient): Promise<number> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: overdueItems } = await db
    .from("vehicle_maintenance")
    .select("id, vehicle_id, service_type, due_date")
    .eq("status", "pending")
    .lt("due_date", todayStr)
    .limit(100);

  if (!overdueItems || overdueItems.length === 0) return 0;

  const vehicleIds = [...new Set(overdueItems.map((m: { vehicle_id: string }) => m.vehicle_id))];
  const { data: vehicleInfo } = await db
    .from("vehicles")
    .select("id, name, plate_number")
    .in("id", vehicleIds);

  const vehicleMap = new Map((vehicleInfo ?? []).map((v: { id: string; name: string; plate_number: string }) => [v.id, v]));

  const { data: sampleAdmin } = await db
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin"])
    .eq("status", "active")
    .limit(1)
    .single();

  if (!sampleAdmin) return 0;
  let alertsSent = 0;

  for (const item of overdueItems) {
    const v = vehicleMap.get(item.vehicle_id);
    const plate = v?.plate_number || "Unknown";
    const already = await alreadyNotified(
      db, sampleAdmin.id, "fleet_maintenance_overdue", plate, oneDayAgo(),
    );
    if (already) continue;

    const daysOverdue = Math.round((Date.now() - new Date(item.due_date + "T00:00:00Z").getTime()) / 86_400_000);
    await notifyAdmins(db, {
      type: "fleet_maintenance_overdue",
      priority: daysOverdue >= 14 ? "high" : "normal",
      title: `🔧 ${plate} — overdue ${item.service_type}`,
      body: `${plate}'s ${item.service_type} is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue (due ${item.due_date}). Fuel requests are blocked until completed.`,
    });
    alertsSent++;
  }
  return alertsSent;
}

// ── entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json() as {
      event: "fuel_approved" | "trip_ended" | "compliance_check" | "maintenance_check";
      vehicle_id?: string;
    };

    if (body.event === "compliance_check") {
      const count = await handleComplianceCheck(db);
      return new Response(
        JSON.stringify({ ok: true, alerts_sent: count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.event === "maintenance_check") {
      const count = await handleMaintenanceCheck(db);
      return new Response(
        JSON.stringify({ ok: true, alerts_sent: count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!body.vehicle_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "vehicle_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.event === "fuel_approved") {
      await handleBudgetAlerts(db, body.vehicle_id);
    } else if (body.event === "trip_ended") {
      await handleFuelLevelAlert(db, body.vehicle_id);
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: "unknown event" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[fleet-alerts]", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
