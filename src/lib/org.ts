import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type OrgRole = "owner" | "admin" | "viewer";

export type Membership = {
  orgId: string;
  orgName: string;
  role: OrgRole;
};

export type OrgContext = {
  user: User;
  membership: Membership | null;
  entitledDistricts: { id: string; name: string; state: string; type: string }[];
  features: string[];
};

/*
  Loads the signed in user's org membership and entitled districts.
  All reads go through RLS: a user with no seat gets an empty context,
  which the UI renders as the "no access" screen.
*/
export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberRows } = await supabase
    .from("org_members")
    .select("org_id, role, organizations(name)")
    .eq("user_id", user.id);

  const first = memberRows?.[0];
  if (!first)
    return { user, membership: null, entitledDistricts: [], features: [] };

  const orgs = first.organizations as unknown as { name: string } | null;
  const membership: Membership = {
    orgId: first.org_id,
    orgName: orgs?.name ?? "Organization",
    role: first.role as OrgRole,
  };

  const [{ data: entitlementRows }, { data: featureRows }] = await Promise.all([
    supabase
      .from("org_entitlements")
      .select("district_id, districts(id, name, state, type)")
      .eq("org_id", membership.orgId),
    supabase.from("org_features").select("feature").eq("org_id", membership.orgId),
  ]);

  const entitledDistricts = (entitlementRows ?? [])
    .map((r) => r.districts as unknown as OrgContext["entitledDistricts"][number])
    .filter(Boolean);

  return {
    user,
    membership,
    entitledDistricts,
    features: (featureRows ?? []).map((f) => f.feature),
  };
}
