import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import {
  getAvailableDistricts,
  getFilteredOverview,
  logAccess,
} from "@/lib/insights";
import { districtLabel, districtsLabel, parseAudience } from "@/lib/filters";
import { AppShell } from "@/components/AppShell";
import { FilterSidebar } from "@/components/FilterSidebar";
import { SampleSize } from "@/components/Sample";
import { TopicsTable, type TopicRow } from "@/components/TopicsTable";

export default async function BillsPage({
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
    getAvailableDistricts(),
  ]);
  const bills = all.filter((i) => i.kind === "bill" || i.kind === "live_bill");
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "bills", {
    district_id: audience.districts.join(",") || districtId,
  });

  const rows: TopicRow[] = bills.map((b) => ({
    id: b.id,
    kind: b.kind,
    status: b.status,
    title: b.title,
    category: b.kind === "bill" ? "City and curated" : (b.category ?? "Federal"),
    createdAt: null,
    mean: b.stats?.avg_value ?? null,
    distribution: b.stats?.distribution ?? null,
    n: b.stats?.n ?? 0,
    change7: b.change7,
    change30: b.change30,
    tracked: b.tracked,
  }));
  const totalResponses = rows.reduce((a, r) => a + r.n, 0);
  const scope = audience.districts.length
    ? districtsLabel(audience.districts)
    : districtLabel(districtId);

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Bills">
      <div className="flex items-start gap-5">
        <div className="hidden md:block">
          <FilterSidebar
            districts={availableDistricts}
            hasExactFeature={ctx.features.includes("district_exact")}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
              Bills: {scope}
            </h1>
            <p className="text-sm text-muted">
              Curated legislation and live synced federal bills, rated by
              verified constituents. Use the toolbar to slice by region, party,
              age, sex, and race; click column headers to sort and filter.
            </p>
          </div>

          <div className="mb-5 grid grid-cols-3 gap-4">
            {[
              { label: "Bills", value: rows.length },
              { label: "Responses in view", value: totalResponses },
              {
                label: "Median responses per bill",
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
              showAdded={false}
              showStatus={true}
              itemLabel="Bill"
            />
          </div>
          <section className="space-y-3 md:hidden">
            {rows.slice(0, 30).map((r) => (
              <Link
                key={`${r.kind}:${r.id}`}
                href={`/districts/${districtId}/items/${r.kind}/${encodeURIComponent(r.id)}`}
                className="block rounded-xl border border-border bg-card p-4"
              >
                <div className="mb-1 text-sm font-medium">{r.title}</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold tabular-nums text-brand-800">
                    {r.mean?.toFixed(2) ?? "0"}
                  </span>
                  <SampleSize n={r.n} />
                  <span className="text-xs text-muted">{r.category}</span>
                </div>
              </Link>
            ))}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
