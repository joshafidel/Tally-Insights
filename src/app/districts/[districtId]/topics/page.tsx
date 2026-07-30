import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getDistrictOverview, logAccess } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { PartyFilter } from "@/components/PartyFilter";
import { SampleSize } from "@/components/Sample";
import { TopicsTable, type TopicRow } from "@/components/TopicsTable";

export default async function TopicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ districtId: string }>;
  searchParams: Promise<{ party?: string }>;
}) {
  const { districtId } = await params;
  const { party: partyParam } = await searchParams;
  const party = ["D", "R", "I"].includes(partyParam ?? "")
    ? (partyParam as "D" | "R" | "I")
    : undefined;
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const district = ctx.entitledDistricts.find((d) => d.id === districtId);
  if (!district) notFound();

  const all = await getDistrictOverview(ctx.membership.orgId, districtId, party);
  const topics = all.filter((i) => i.kind === "topic");
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "topics", {
    district_id: districtId,
    party: party ?? "all",
  });

  const rows: TopicRow[] = topics.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    createdAt: t.createdAt,
    mean: t.stats?.avg_value ?? null,
    distribution: t.stats?.distribution ?? null,
    n: t.stats?.n ?? 0,
    change7: t.change7,
    change30: t.change30,
    tracked: t.tracked,
  }));

  const withData = rows.filter((r) => r.n > 0);
  const totalResponses = withData.reduce((a, r) => a + r.n, 0);
  const partyLabel =
    party === "D"
      ? "Democratic"
      : party === "R"
        ? "Republican"
        : party === "I"
          ? "Independent"
          : null;

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Topics">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
            {district.name}: topics
          </h1>
          <p className="text-sm text-muted">
            {partyLabel
              ? `${partyLabel} sentiment only. Trend columns reflect all voters.`
              : "Standing questions constituents answer in the Tally app, on a 1 to 5 agree scale. Click column headers to sort and filter."}
          </p>
        </div>
        <PartyFilter
          basePath={`/districts/${districtId}/topics`}
          current={party ?? "all"}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Topics", value: rows.length },
          { label: "With responses", value: withData.length },
          {
            label: partyLabel ? `${partyLabel} responses` : "Total responses",
            value: totalResponses,
          },
          { label: "Tracked by your org", value: rows.filter((r) => r.tracked).length },
        ].map((t) => (
          <div
            key={t.label}
            className="rounded-2xl border border-brand-200 bg-gradient-to-b from-card to-brand-50/70 px-5 py-4 shadow-sm"
          >
            <div className="text-2xl font-semibold tabular-nums text-brand-800">
              {t.value.toLocaleString("en-US")}
            </div>
            <div className="text-xs uppercase tracking-wide text-muted">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Desktop: spreadsheet style table with header filters */}
      <div className="hidden md:block">
        <TopicsTable rows={rows} districtId={districtId} />
      </div>

      {/* Mobile: read only summary */}
      <section className="space-y-3 md:hidden">
        {(withData.length > 0 ? withData : rows.slice(0, 25)).map((r) => (
          <Link
            key={r.id}
            href={`/districts/${districtId}/items/topic/${encodeURIComponent(r.id)}`}
            className="block rounded-xl border border-border bg-card p-4"
          >
            <div className="mb-1 text-sm font-medium">{r.title}</div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold tabular-nums text-brand-800">
                {r.mean?.toFixed(2) ?? "no responses yet"}
              </span>
              <SampleSize n={r.n} />
              <span className="capitalize text-xs text-muted">{r.category ?? "other"}</span>
            </div>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
