import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type OrgRole = "owner" | "admin" | "viewer";

export type Membership = {
  orgId: string;
  orgName: string;
  role: OrgRole;
  primaryDistrictId: string | null;
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
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const supabase = await createClient();
  // Middleware already validated the token against the auth server on this
  // request; reading the session from the cookie here avoids a second
  // network round trip per page.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data: memberRows } = await supabase
    .from("org_members")
    .select("org_id, role, organizations(name, primary_district_id)")
    .eq("user_id", user.id);

  const first = memberRows?.[0];
  if (!first)
    return { user, membership: null, entitledDistricts: [], features: [] };

  const orgs = first.organizations as unknown as {
    name: string;
    primary_district_id: string | null;
  } | null;
  const membership: Membership = {
    orgId: first.org_id,
    orgName: orgs?.name ?? "Organization",
    role: first.role as OrgRole,
    primaryDistrictId: orgs?.primary_district_id ?? null,
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
});
