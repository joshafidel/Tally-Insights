"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/*
  All writes go through the caller's RLS scoped session: the database, not
  this code, enforces that only owners and admins of the org can change the
  watchlist or alert rules, and only for entitled districts.
*/

export async function addTrackedItem(formData: FormData) {
  const supabase = await createClient();
  const districtId = String(formData.get("district_id"));
  const composite = String(formData.get("item"));
  const sep = composite.indexOf(":");
  const kind = composite.slice(0, sep);
  const itemId = composite.slice(sep + 1);
  const orgId = String(formData.get("org_id"));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!kind || !itemId) return;

  await supabase.from("tracked_items").insert({
    org_id: orgId,
    kind,
    item_id: itemId,
    district_id: districtId,
    added_by: user?.id,
  });
  await supabase.from("access_log").insert({
    org_id: orgId,
    user_id: user?.id,
    action: "track",
    resource: "tracked_items",
    detail: { kind, item_id: itemId, district_id: districtId },
  });
  revalidatePath(`/districts/${districtId}`, "layout");
}

export async function removeTrackedItem(formData: FormData) {
  const supabase = await createClient();
  const districtId = String(formData.get("district_id"));
  await supabase
    .from("tracked_items")
    .delete()
    .eq("org_id", String(formData.get("org_id")))
    .eq("kind", String(formData.get("kind")))
    .eq("item_id", String(formData.get("item_id")))
    .eq("district_id", districtId);
  revalidatePath(`/districts/${districtId}`, "layout");
}

export async function createAlertRule(formData: FormData) {
  const supabase = await createClient();
  const districtId = String(formData.get("district_id"));
  const composite = String(formData.get("item"));
  const sep = composite.indexOf(":");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const threshold = Number(formData.get("threshold"));
  const windowDays = Number(formData.get("window_days"));
  if (!(threshold > 0)) return;

  await supabase.from("item_alert_rules").insert({
    org_id: String(formData.get("org_id")),
    kind: composite.slice(0, sep),
    item_id: composite.slice(sep + 1),
    district_id: districtId,
    threshold,
    window_days: windowDays === 30 ? 30 : 7,
    created_by: user?.id,
  });
  revalidatePath(`/districts/${districtId}/watchlist`);
}

export async function toggleAlertRule(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("item_alert_rules")
    .update({ active: String(formData.get("active")) === "true" })
    .eq("id", String(formData.get("rule_id")));
  revalidatePath(`/districts/${String(formData.get("district_id"))}/watchlist`);
}

export async function deleteAlertRule(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("item_alert_rules")
    .delete()
    .eq("id", String(formData.get("rule_id")));
  revalidatePath(`/districts/${String(formData.get("district_id"))}/watchlist`);
}

export async function acknowledgeAlert(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase
    .from("item_alert_events")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user?.id })
    .eq("id", String(formData.get("event_id")));
  revalidatePath(`/districts/${String(formData.get("district_id"))}/watchlist`);
}
