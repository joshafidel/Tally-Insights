import { createClient } from "@/lib/supabase/server";

export type ItemKind = "topic" | "bill" | "live_bill";

export type CatalogItem = {
  kind: ItemKind;
  id: string;
  title: string;
  subtitle: string;
  status: string | null;
  summary: string | null;
};

export type ItemStats = {
  kind: string;
  item_id: string;
  district_id: string;
  n: number;
  avg_value: number | null;
  distribution: number[] | null;
  low_sample: boolean;
};

export type ItemTrendPoint = {
  kind: string;
  item_id: string;
  district_id: string;
  day: string;
  n: number;
  avg_value: number | null;
};

export type PartyRow = {
  party: string;
  n: number;
  avg_value: number | null;
  low_sample: boolean;
};

export type AlignmentRow = {
  official_id: string;
  official_name: string;
  official_party: string;
  official_role: string;
  photo_url: string | null;
  district_id: string;
  bill_id: string;
  bill_title: string;
  agree_direction: string;
  vote: string;
  voted_at: string | null;
  sample_n: number;
  district_avg: number | null;
  official_position: number | null;
  gap: number | null;
  alignment: string;
};

export const KIND_LABEL: Record<ItemKind, string> = {
  topic: "Topic",
  bill: "City and curated bills",
  live_bill: "Federal bills (live synced)",
};

/*
  Full rateable catalog: every topic, every curated bill, every synced federal
  bill, plus any item real users rated that is not in a content table (the
  consumer app stores those titles on the weigh in row).
*/
export async function getCatalog(): Promise<CatalogItem[]> {
  const supabase = await createClient();
  const [{ data: topics }, { data: bills }, { data: liveBills }] =
    await Promise.all([
      supabase.from("topics").select("id, title, category, prompt"),
      supabase
        .from("bills")
        .select("id, title, chamber, sponsor, status, plain_summary"),
      supabase
        .from("live_bills")
        .select("id, title, label, status, sponsor, policy_area, short_summary, gen_summary")
        .limit(1000),
    ]);

  const items: CatalogItem[] = [];
  for (const t of topics ?? []) {
    items.push({
      kind: "topic",
      id: t.id,
      title: t.title,
      subtitle: `Topic · ${t.category}`,
      status: null,
      summary: t.prompt,
    });
  }
  for (const b of bills ?? []) {
    items.push({
      kind: "bill",
      id: b.id,
      title: b.title,
      subtitle: `${b.chamber} · ${b.sponsor}`,
      status: b.status,
      summary: b.plain_summary,
    });
  }
  for (const lb of liveBills ?? []) {
    items.push({
      kind: "live_bill",
      id: lb.id,
      title: lb.title,
      subtitle: `${lb.label ?? lb.id}${lb.sponsor ? ` · ${lb.sponsor}` : ""}${lb.policy_area ? ` · ${lb.policy_area}` : ""}`,
      status: lb.status,
      summary: lb.gen_summary ?? lb.short_summary,
    });
  }
  return items;
}

function changeOver(points: ItemTrendPoint[], days: number): number | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  if (latest.avg_value == null) return null;
  const cutoff = new Date(latest.day);
  cutoff.setDate(cutoff.getDate() - days);
  let past: ItemTrendPoint | null = null;
  for (const p of points) {
    if (new Date(p.day) <= cutoff) past = p;
    else break;
  }
  if (!past || past.avg_value == null) return null;
  return Math.round((latest.avg_value - past.avg_value) * 100) / 100;
}

export type OverviewItem = CatalogItem & {
  stats: ItemStats | null;
  change7: number | null;
  change30: number | null;
  tracked: boolean;
};

export async function getDistrictOverview(
  orgId: string,
  districtId: string,
  party?: "D" | "R" | "I"
) {
  const supabase = await createClient();
  const [catalog, { data: stats }, { data: trend }, { data: tracked }] =
    await Promise.all([
      getCatalog(),
      party
        ? supabase
            .from("insights_item_party")
            .select("*")
            .eq("district_id", districtId)
            .eq("party", party)
        : supabase
            .from("insights_item_sentiment")
            .select("*")
            .eq("district_id", districtId),
      supabase
        .from("insights_item_trend")
        .select("*")
        .eq("district_id", districtId)
        .order("day", { ascending: true })
        .limit(10000),
      supabase
        .from("tracked_items")
        .select("kind, item_id")
        .eq("org_id", orgId)
        .eq("district_id", districtId),
    ]);

  // Rated items that are not in a content table (roll call votes, items the
  // consumer app created ad hoc) still get a row, titled from the view.
  const catalogKeys = new Set(catalog.map((c) => `${c.kind}:${c.id}`));
  for (const s of (stats ?? []) as (ItemStats & { title?: string | null })[]) {
    const key = `${s.kind}:${s.item_id}`;
    if (!catalogKeys.has(key)) {
      catalogKeys.add(key);
      catalog.push({
        kind: s.kind as ItemKind,
        id: s.item_id,
        title: s.title ?? s.item_id,
        subtitle: "Rated in the Tally app",
        status: null,
        summary: null,
      });
    }
  }

  const statsMap = new Map<string, ItemStats>();
  for (const s of (stats ?? []) as ItemStats[]) statsMap.set(`${s.kind}:${s.item_id}`, s);
  const trendMap = new Map<string, ItemTrendPoint[]>();
  for (const p of (trend ?? []) as ItemTrendPoint[]) {
    const key = `${p.kind}:${p.item_id}`;
    const arr = trendMap.get(key) ?? [];
    arr.push(p);
    trendMap.set(key, arr);
  }
  const trackedSet = new Set((tracked ?? []).map((t) => `${t.kind}:${t.item_id}`));

  const items: OverviewItem[] = catalog.map((c) => {
    const key = `${c.kind}:${c.id}`;
    const points = trendMap.get(key) ?? [];
    return {
      ...c,
      stats: statsMap.get(key) ?? null,
      change7: changeOver(points, 7),
      change30: changeOver(points, 30),
      tracked: trackedSet.has(key),
    };
  });

  items.sort((a, b) => {
    const an = a.stats?.n ?? 0;
    const bn = b.stats?.n ?? 0;
    if (an !== bn) return bn - an;
    if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  return items;
}

export async function getItemDetail(
  districtId: string,
  kind: ItemKind,
  itemId: string
) {
  const supabase = await createClient();
  const [
    catalog,
    { data: stats },
    { data: party },
    { data: trend },
    { data: ageYears },
    { data: exactDistricts },
  ] = await Promise.all([
    getCatalog(),
    supabase
      .from("insights_item_sentiment")
      .select("*")
      .eq("district_id", districtId)
      .eq("kind", kind)
      .eq("item_id", itemId)
      .maybeSingle(),
    supabase
      .from("insights_item_party")
      .select("*")
      .eq("district_id", districtId)
      .eq("kind", kind)
      .eq("item_id", itemId),
    supabase
      .from("insights_item_trend")
      .select("*")
      .eq("district_id", districtId)
      .eq("kind", kind)
      .eq("item_id", itemId)
      .order("day", { ascending: true })
      .limit(2000),
    supabase
      .from("insights_item_age_year")
      .select("*")
      .eq("district_id", districtId)
      .eq("kind", kind)
      .eq("item_id", itemId)
      .order("age_years", { ascending: true }),
    supabase
      .from("insights_item_district_exact")
      .select("*")
      .eq("root_district", districtId)
      .eq("kind", kind)
      .eq("item_id", itemId)
      .order("n", { ascending: false }),
  ]);

  let item = catalog.find((c) => c.kind === kind && c.id === itemId) ?? null;
  if (!item && stats) {
    const s = stats as ItemStats & { title?: string | null };
    item = {
      kind,
      id: itemId,
      title: s.title ?? itemId,
      subtitle: "Rated in the Tally app",
      status: null,
      summary: null,
    };
  }

  return {
    item,
    stats: (stats as ItemStats | null) ?? null,
    party: ((party ?? []) as (PartyRow & { party: string })[]).sort((a, b) =>
      a.party.localeCompare(b.party)
    ),
    trend: (trend ?? []) as ItemTrendPoint[],
    ageYears: (ageYears ?? []) as {
      age_years: number;
      n: number;
      avg_value: number | null;
      low_sample: boolean;
    }[],
    exactDistricts: (exactDistricts ?? []) as {
      district_id: string;
      n: number;
      avg_value: number | null;
      low_sample: boolean;
    }[],
  };
}

export async function getAlignment(districtIds: string[]) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("insights_official_alignment_live")
    .select("*")
    .in("district_id", districtIds)
    .limit(2000);
  return (data ?? []) as AlignmentRow[];
}

/* Append only audit trail. A failed log write never blocks a page. */
export async function logAccess(
  orgId: string,
  userId: string,
  action: string,
  resource: string,
  detail?: Record<string, unknown>
) {
  const supabase = await createClient();
  await supabase
    .from("access_log")
    .insert({
      org_id: orgId,
      user_id: userId,
      action,
      resource,
      detail: detail ?? null,
    })
    .then(() => undefined);
}
