"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  Seat management uses the service role client because creating auth users
  requires it. Every action first verifies, through the caller's own RLS
  scoped session, that the caller is an owner or admin of the org. The
  database still enforces the same rules on org_members writes.
*/

async function requireOrgAdmin(orgId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes(data.role)) return null;
  return { user, role: data.role as "owner" | "admin" };
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function inviteSeat(formData: FormData) {
  const orgId = String(formData.get("org_id"));
  const email = String(formData.get("email")).trim();
  const role = String(formData.get("role"));
  if (!email || !["admin", "viewer", "owner"].includes(role)) return;

  const caller = await requireOrgAdmin(orgId);
  if (!caller) return;
  if (role === "owner" && caller.role !== "owner") return;

  const admin = createAdminClient();
  let userId: string | null = null;
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (!error && invited?.user) {
    userId = invited.user.id;
  } else {
    userId = await findUserIdByEmail(email);
  }
  if (!userId) return;

  await admin.from("org_members").upsert({
    org_id: orgId,
    user_id: userId,
    role,
  });
  const supabase = await createClient();
  await supabase.from("access_log").insert({
    org_id: orgId,
    user_id: caller.user.id,
    action: "invite_seat",
    resource: "org_members",
    detail: { email, role },
  });
  revalidatePath("/admin");
}

export async function removeSeat(formData: FormData) {
  const orgId = String(formData.get("org_id"));
  const targetUserId = String(formData.get("user_id"));
  const caller = await requireOrgAdmin(orgId);
  if (!caller) return;

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!target) return;
  if (target.role === "owner") {
    if (caller.role !== "owner") return;
    const { count } = await admin
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) return;
  }

  await admin
    .from("org_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", targetUserId);
  const supabase = await createClient();
  await supabase.from("access_log").insert({
    org_id: orgId,
    user_id: caller.user.id,
    action: "remove_seat",
    resource: "org_members",
    detail: { removed_user_id: targetUserId },
  });
  revalidatePath("/admin");
}

export async function changeSeatRole(formData: FormData) {
  const orgId = String(formData.get("org_id"));
  const targetUserId = String(formData.get("user_id"));
  const role = String(formData.get("role"));
  if (!["owner", "admin", "viewer"].includes(role)) return;
  const caller = await requireOrgAdmin(orgId);
  if (!caller) return;
  if (role === "owner" && caller.role !== "owner") return;

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!target) return;
  if (target.role === "owner") {
    if (caller.role !== "owner") return;
    if (role !== "owner") {
      const { count } = await admin
        .from("org_members")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("role", "owner");
      if ((count ?? 0) <= 1) return;
    }
  }

  await admin
    .from("org_members")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", targetUserId);
  const supabase = await createClient();
  await supabase.from("access_log").insert({
    org_id: orgId,
    user_id: caller.user.id,
    action: "change_role",
    resource: "org_members",
    detail: { target_user_id: targetUserId, role },
  });
  revalidatePath("/admin");
}
