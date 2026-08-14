import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import {
  getAvailableDistricts,
  getFilteredOverview,
  logAccess,
} from "@/lib/insights";
import { categoryLabel, districtLabel, districtsLabel, parseAudience } from "@/lib/filters";
import { AppShell } from "@/components/AppShell";
import { FilterSidebar } from "@/components/FilterSidebar";
import { SampleSize } from "@/components/Sample";
import { TopicsTable, type TopicRow } from "@/components/TopicsTable";


export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ districtId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { districtId } = await params;
  const audience = parseAudience(await searchParams);
  const scope = audience.districts.length
    ? districtsLabel(audience.districts)
    : districtLabel(districtId);
  return { title: `Topics: ${scope}` };
}

export default async function TopicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ districtId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { districtId } = await params;
  const sp = await searchParams;
  const audience = parseAudience(sp);
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const district = ctx.entitledDistricts.find((d) => d.id === districtId);
  if (!district) notFound();

  const [all, availableDistricts] = await Promise.all([
    getFilteredOverview(ctx.membership.orgId, districtId, audience),
    getAvailableDistricts(ctx.membership.orgId),
  ]);
  const topics = all.filter((i) => i.kind === "topic");
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "topics", {
    district_id: audience.districts.join(",") || districtId,
  });

  const rows: TopicRow[] = topics.map((t) => ({
    id: t.id,
    kind: t.kind,
    status: null,
    title: t.title,
    category: categoryLabel(t.category),
    createdAt: t.createdAt,
    mean: t.stats?.avg_value ?? null,
    distribution: t.stats?.distribution ?? null,
    n: t.stats?.n ?? 0,
    change7: t.change7,
    change30: t.change30,
    tracked: t.tracked,
  }));
  const totalResponses = rows.reduce((a, r) => a + r.n, 0);
  const scope = audience.districts.length
    ? districtsLabel(audience.districts)
    : districtLabel(districtId);
  const qs = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]
  ).toString();

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Topics">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <FilterSidebar
          districts={availableDistricts}
          hasExactFeature={ctx.features.includes("district_exact")}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
              Topics: {scope}
            </h1>
            <p className="text-sm text-muted">
              Every standing question from the Tally app, rated by verified
              constituents on a 1 to 5 agree scale. Use the toolbar to slice by
              region, party, age, sex, and race; click column headers to sort
              and filter.
            </p>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              { label: "Topics", value: rows.length },
              { label: "Responses in view", value: totalResponses },
              {
                label: "Median responses per topic",
                value:
                  [...rows.map((r) => r.n)].sort((a, b) => a - b)[
                    Math.floor(rows.length / 2)
                  ] ?? 0,
              },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-2xl border border-brand-200 bg-gradient-to-b from-card to-brand-50/70 px-5 py-4 shadow-sm"
              >
                <div className="text-2xl font-semibold tabular-nums text-brand-800">
                  {t.value.toLocaleString("en-US")}
                </div>
                <div className="text-xs uppercase tracking-wide text-muted">
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <TopicsTable
              rows={rows}
              districtId={districtId}
              orgId={ctx.membership.orgId}
              canTrack={ctx.membership.role !== "viewer"}
            />
          </div>
          <section className="space-y-3 md:hidden">
            {rows.slice(0, 80).map((r) => (
              <Link
                key={r.id}
                href={`/districts/${districtId}/items/topic/${encodeURIComponent(r.id)}${qs ? `?${qs}` : ""}`}
                className="block rounded-xl border border-border bg-card p-4"
              >
                <div className="mb-1 text-sm font-medium">{r.title}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold tabular-nums text-brand-800">
                    {r.mean?.toFixed(2) ?? "0"}
                  </span>
                  {r.change7 != null && r.change7 !== 0 && (
                    <span
                      className="text-xs font-medium tabular-nums"
                      style={{ color: r.change7 > 0 ? "#15803d" : "#b91c1c" }}
                    >
                      {r.change7 > 0 ? "▲" : "▼"} {Math.abs(r.change7).toFixed(2)} in 7d
                    </span>
                  )}
                  <SampleSize n={r.n} />
                  <span className="ml-auto text-xs text-muted">{r.category}</span>
                </div>
              </Link>
            ))}
            {rows.length > 80 && (
              <p className="text-center text-xs text-muted">
                Showing the first 80 of {rows.length} topics. The full sortable
                table is available on a larger screen.
              </p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
