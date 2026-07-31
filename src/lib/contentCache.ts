import { createClient as createServiceClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

/*
  Cross request caches for content that changes slowly: the item catalog
  and each org's available district counts. These reads run with the
  service role (no cookies, so they are cacheable across users) and
  revalidate on a short timer. Row level security still governs every
  interactive read and write; nothing here exposes raw responses.
*/

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type CatalogRaw = {
  topics: { id: string; title: string; category: string | null; created_at: string | null }[];
  bills: { id: string; title: string; chamber: string | null; sponsor: string | null; status: string | null; topic_category: string | null }[];
  liveBills: {
    id: string;
    title: string;
    label: string | null;
    status: string | null;
    sponsor: string | null;
    policy_area: string | null;
  }[];
  districts: { id: string; state: string }[];
};

export const cachedCatalogRaw = unstable_cache(
  async (): Promise<CatalogRaw | null> => {
    const sb = serviceClient();
    if (!sb) return null;
    const [{ data: topics }, { data: bills }, { data: liveBills }, { data: districts }] =
      await Promise.all([
        sb.from("topics").select("id, title, category, created_at"),
        sb.from("bills").select("id, title, chamber, sponsor, status, topic_category"),
        sb
          .from("live_bills")
          .select("id, title, label, status, sponsor, policy_area")
          .limit(1000),
        sb.from("districts").select("id, state"),
      ]);
    return {
      topics: topics ?? [],
      bills: bills ?? [],
      liveBills: liveBills ?? [],
      districts: districts ?? [],
    };
  },
  ["catalog-raw"],
  { revalidate: 300 }
);

export async function cachedAvailableDistricts(
  orgId: string
): Promise<{ district_id: string; root_district: string; n: number }[] | null> {
  const sb = serviceClient();
  if (!sb) return null;
  return unstable_cache(
    async () => {
      const { data } = await sb.rpc("insights_available_districts_for_org", {
        p_org: orgId,
      });
      return (data ?? []) as { district_id: string; root_district: string; n: number }[];
    },
    ["avail-districts", orgId],
    { revalidate: 180 }
  )();
}
