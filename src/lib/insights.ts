import { createClient } from "@/lib/supabase/server";

export type BillMeta = {
  id: string;
  title: string;
  plain_summary: string;
  sponsor: string;
  chamber: string;
  status: string;
  vote_date: string | null;
  topic_category: string | null;
};

export type SentimentRow = {
  bill_id: string;
  district_id: string;
  n: number;
  avg_value: number | null;
  distribution: number[] | null;
  suppressed: boolean;
};

export type TrendPoint = {
  bill_id: string;
  district_id: string;
  day: string;
  n: number;
  avg_value: number | null;
  suppressed: boolean;
};

export type BreakdownRow = {
  bill_id: string;
  district_id: string;
  n: number;
  avg_value: number | null;
  distribution: number[] | null;
  suppressed: boolean;
  party?: string;
  age_bucket?: string;
  sex?: string;
};

export type OverviewRow = {
  bill: BillMeta;
  sentiment: SentimentRow | null;
  change7: number | null;
  change30: number | null;
};

function changeOver(points: TrendPoint[], days: number): number | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  if (latest.avg_value == null) return null;
  const latestDay = new Date(latest.day);
  const cutoff = new Date(latestDay);
  cutoff.setDate(cutoff.getDate() - days);
  let past: TrendPoint | null = null;
  for (const p of points) {
    if (new Date(p.day) <= cutoff) past = p;
    else break;
  }
  if (!past || past.avg_value == null) return null;
  return Math.round((latest.avg_value - past.avg_value) * 100) / 100;
}

export async function getDistrictOverview(orgId: string, districtId: string) {
  const supabase = await createClient();

  const { data: tracked } = await supabase
    .from("tracked_bills")
    .select("bill_id")
    .eq("org_id", orgId)
    .eq("district_id", districtId);
  const billIds = (tracked ?? []).map((t) => t.bill_id);
  if (billIds.length === 0) return { rows: [] as OverviewRow[] };

  const [{ data: bills }, { data: sentiment }, { data: trend }] =
    await Promise.all([
      supabase.from("bills").select("*").in("id", billIds),
      supabase
        .from("insights_bill_sentiment")
        .select("*")
        .eq("district_id", districtId)
        .in("bill_id", billIds),
      supabase
        .from("insights_bill_trend")
        .select("*")
        .eq("district_id", districtId)
        .in("bill_id", billIds)
        .order("day", { ascending: true })
        .limit(10000),
    ]);

  const byBillTrend = new Map<string, TrendPoint[]>();
  for (const p of (trend ?? []) as TrendPoint[]) {
    const arr = byBillTrend.get(p.bill_id) ?? [];
    arr.push(p);
    byBillTrend.set(p.bill_id, arr);
  }
  const byBillSentiment = new Map<string, SentimentRow>();
  for (const s of (sentiment ?? []) as SentimentRow[]) {
    byBillSentiment.set(s.bill_id, s);
  }

  const rows: OverviewRow[] = ((bills ?? []) as BillMeta[]).map((bill) => {
    const points = byBillTrend.get(bill.id) ?? [];
    return {
      bill,
      sentiment: byBillSentiment.get(bill.id) ?? null,
      change7: changeOver(points, 7),
      change30: changeOver(points, 30),
    };
  });

  rows.sort((a, b) => {
    const am = Math.max(Math.abs(a.change7 ?? 0), Math.abs(a.change30 ?? 0));
    const bm = Math.max(Math.abs(b.change7 ?? 0), Math.abs(b.change30 ?? 0));
    return bm - am;
  });

  return { rows };
}

export async function getBillDetail(districtId: string, billId: string) {
  const supabase = await createClient();

  const [
    { data: bill },
    { data: sentiment },
    { data: party },
    { data: age },
    { data: sex },
    { data: trend },
    { data: stateRows },
    { data: national },
    { data: district },
  ] = await Promise.all([
    supabase.from("bills").select("*").eq("id", billId).maybeSingle(),
    supabase
      .from("insights_bill_sentiment")
      .select("*")
      .eq("district_id", districtId)
      .eq("bill_id", billId)
      .maybeSingle(),
    supabase
      .from("insights_bill_sentiment_by_party")
      .select("*")
      .eq("district_id", districtId)
      .eq("bill_id", billId),
    supabase
      .from("insights_bill_sentiment_by_age")
      .select("*")
      .eq("district_id", districtId)
      .eq("bill_id", billId),
    supabase
      .from("insights_bill_sentiment_by_sex")
      .select("*")
      .eq("district_id", districtId)
      .eq("bill_id", billId),
    supabase
      .from("insights_bill_trend")
      .select("*")
      .eq("district_id", districtId)
      .eq("bill_id", billId)
      .order("day", { ascending: true })
      .limit(2000),
    supabase.from("insights_bill_sentiment_state").select("*").eq("bill_id", billId),
    supabase
      .from("insights_bill_sentiment_national")
      .select("*")
      .eq("bill_id", billId)
      .maybeSingle(),
    supabase.from("districts").select("*").eq("id", districtId).maybeSingle(),
  ]);

  const stateRow =
    ((stateRows ?? []) as { state: string; n: number; avg_value: number | null; suppressed: boolean }[]).find(
      (r) => r.state === (district as { state?: string } | null)?.state
    ) ?? null;

  return {
    bill: bill as BillMeta | null,
    district: district as { id: string; name: string; state: string } | null,
    sentiment: sentiment as SentimentRow | null,
    party: (party ?? []) as BreakdownRow[],
    age: (age ?? []) as BreakdownRow[],
    sex: (sex ?? []) as BreakdownRow[],
    trend: (trend ?? []) as TrendPoint[],
    state: stateRow,
    national: national as { n: number; avg_value: number | null; suppressed: boolean } | null,
  };
}

/* Append only audit trail. Fire and forget: a failed log write never blocks a page. */
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
