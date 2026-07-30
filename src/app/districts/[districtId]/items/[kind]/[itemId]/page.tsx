import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import {
  getAvailableDistricts,
  getFilteredOverview,
  getItemDetail,
  logAccess,
  type ItemKind,
} from "@/lib/insights";
import { districtLabel, hasAudienceFilters, parseAudience } from "@/lib/filters";
import { FilterSidebar } from "@/components/FilterSidebar";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { TrendChart } from "@/components/charts/TrendChart";
import { AgeCurveChart } from "@/components/charts/AgeCurveChart";
import {
  DistributionTabs,
  type DistributionTabsData,
  type GroupDistribution,
} from "@/components/DistributionTabs";
import { SampleSize, Suppressed } from "@/components/Sample";
import { PARTY_COLOR, PARTY_LABEL, statusLabel } from "@/lib/format";
import {
  addTrackedItem,
  removeTrackedItem,
} from "@/app/districts/[districtId]/watchlist/actions";

const KINDS: ItemKind[] = ["topic", "bill", "live_bill"];
const AGE_ORDER = ["18-29", "30-44", "45-64", "65+", "unknown"];
const SEX_LABELS: Record<string, string> = {
  f: "Women",
  m: "Men",
  x: "X on ID",
  unknown: "Not collected",
};

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ districtId: string; kind: string; itemId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { districtId, kind, itemId: rawItemId } = await params;
  const audience = parseAudience(await searchParams);
  const audienceActive = hasAudienceFilters(audience);
  const effectiveRoot = (audience.district ?? districtId).split("-")[0];
  const itemId = decodeURIComponent(rawItemId);
  if (!KINDS.includes(kind as ItemKind)) notFound();

  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const district = ctx.entitledDistricts.find((d) => d.id === districtId);
  if (!district) notFound();

  const supabase = await createClient();
  const [detail, availableDistricts, { data: trackedRow }] = await Promise.all([
    getItemDetail(effectiveRoot, kind as ItemKind, itemId),
    getAvailableDistricts(),
    supabase
      .from("tracked_items")
      .select("item_id")
      .eq("org_id", ctx.membership.orgId)
      .eq("kind", kind)
      .eq("item_id", itemId)
      .eq("district_id", districtId)
      .maybeSingle(),
  ]);
  if (!detail.item) notFound();
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "item_detail", {
    district_id: districtId,
    kind,
    item_id: itemId,
  });

  const { item, trend } = detail;
  let stats = detail.stats;
  if (audienceActive) {
    const filtered = await getFilteredOverview(
      ctx.membership.orgId,
      districtId,
      audience
    );
    const mine = filtered.find((i) => i.kind === kind && i.id === itemId);
    stats = mine?.stats ?? { ...detail.stats, n: 0, avg_value: null, distribution: null } as never;
  }
  const isTracked = Boolean(trackedRow);
  const canEdit = ctx.membership.role !== "viewer";

  const partyGroups: GroupDistribution[] = ["D", "R", "I", "U"]
    .map((p) => detail.party.find((r) => r.party === p))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.party,
      label: r.party === "U" ? "Party not stated" : PARTY_LABEL[r.party] ?? r.party,
      color: r.party === "U" ? "var(--brand-300)" : PARTY_COLOR[r.party],
      n: r.n,
      avg: r.avg_value,
      distribution: r.distribution ?? null,
    }));
  const ageGroups: GroupDistribution[] = AGE_ORDER.map((a) =>
    detail.ageBrackets.find((r) => r.age_bucket === a)
  )
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.age_bucket!,
      label: r.age_bucket === "unknown" ? "Age unknown" : r.age_bucket!,
      color: "var(--brand-500)",
      n: r.n,
      avg: r.avg_value,
      distribution: r.distribution ?? null,
    }));
  const sexGroups: GroupDistribution[] = ["f", "m", "x", "unknown"]
    .map((s) => detail.sexRows.find((r) => r.sex === s))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.sex!,
      label: SEX_LABELS[r.sex!] ?? r.sex!,
      color: "var(--brand-500)",
      n: r.n,
      avg: r.avg_value,
      distribution: r.distribution ?? null,
    }));
  const raceGroups: GroupDistribution[] = [...detail.raceRows]
    .sort((a, b) => b.n - a.n)
    .map((r) => ({
      key: r.race!,
      label: r.race === "unknown" ? "Not stated" : r.race!,
      color: "var(--brand-500)",
      n: r.n,
      avg: r.avg_value,
      distribution: r.distribution ?? null,
    }));

  const tabsData: DistributionTabsData = {
    all: {
      n: stats?.n ?? 0,
      avg: stats?.avg_value ?? null,
      distribution: stats?.distribution ?? null,
    },
    party: partyGroups,
    age: ageGroups,
    sex: sexGroups,
    race: raceGroups,
  };

  const trendPoints = trend.map((p) => ({ day: p.day, avg: p.avg_value, n: p.n }));
  const agePoints = detail.ageYears.map((r) => ({
    age: r.age_years,
    avg: r.avg_value,
    n: r.n,
  }));

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Overview">
      <div className="flex items-start gap-5">
        <div className="hidden md:block">
          <FilterSidebar
            districts={availableDistricts}
            hasExactFeature={ctx.features.includes("district_exact")}
          />
        </div>
        <div className="min-w-0 flex-1">
      <div className="mb-6">
        <Link
          href={`/districts/${districtId}/${kind === "topic" ? "topics" : "bills"}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to {district.name} {kind === "topic" ? "topics" : "bills"}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-brand-900">{item.title}</h1>
            <div className="mt-1 text-sm text-muted">
              {item.subtitle}
              {item.status ? (
                <>
                  {" "}
                  · Status: <span className="capitalize">{statusLabel(item.status)}</span>
                </>
              ) : null}
            </div>
          </div>
          {canEdit && (
            <form action={isTracked ? removeTrackedItem : addTrackedItem}>
              <input type="hidden" name="org_id" value={ctx.membership.orgId} />
              <input type="hidden" name="district_id" value={districtId} />
              <input type="hidden" name="item" value={`${kind}:${itemId}`} />
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="item_id" value={itemId} />
              <button
                type="submit"
                className={
                  isTracked
                    ? "rounded-md border border-brand-400 bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50"
                    : "rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                }
                title="Tracked items pin to your dashboard and can carry alert rules"
              >
                {isTracked ? "Untrack" : "Track this"}
              </button>
            </form>
          )}
        </div>
        {item.summary && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed">{item.summary}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
            {audienceActive ? "Filtered sentiment" : "District sentiment"}
          </h2>
          {audienceActive && (
            <p className="mb-1 text-xs text-muted">
              Scope: {districtLabel(audience.district ?? districtId)}
              {audience.party.length + audience.age.length + audience.sex.length + audience.race.length > 0
                ? " with demographic filters applied"
                : ""}
              . Tabs and trend show the full {districtLabel(effectiveRoot)} audience.
            </p>
          )}
          {stats?.avg_value != null ? (
            <>
              <div className="text-4xl font-semibold tabular-nums text-brand-800">
                {stats.avg_value.toFixed(2)}
              </div>
              <div className="mt-1">
                <SampleSize n={stats.n} />{" "}
                <span className="text-xs text-muted">verified constituent responses</span>
              </div>
              {stats.low_sample && (
                <div className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
                  Low sample: fewer than 50 responses. Directional only.
                </div>
              )}
            </>
          ) : (
            <Suppressed n={stats?.n} />
          )}
          <div className="mt-4 border-t border-border pt-3 text-xs text-muted">
            Tracking pins this item to your dashboard and makes it eligible for
            movement alert rules on the watchlist page.
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
            Vote distribution
          </h2>
          <DistributionTabs data={tabsData} />
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-brand-300 bg-gradient-to-b from-card to-brand-50/60 p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Sentiment by exact age
            </h2>
            <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Premium
            </span>
          </div>
          {!ctx.features.includes("age_exact") ? (
            <p className="text-sm text-muted">
              Exact age curves are available on a higher tier.
            </p>
          ) : agePoints.length > 1 ? (
            <>
              <AgeCurveChart points={agePoints} />
              <p className="mt-1 text-xs text-muted">
                Mean sentiment at each age in years. Hover for sample sizes.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              Appears once verified users with birth years rate this item.
            </p>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Sentiment trend (cumulative mean by day)
          </h2>
        </div>
        {trendPoints.length > 1 ? (
          <TrendChart points={trendPoints} />
        ) : (
          <p className="text-sm text-muted">
            Trend appears once responses span more than one day.
          </p>
        )}
      </section>
        </div>
      </div>
    </AppShell>
  );
}
