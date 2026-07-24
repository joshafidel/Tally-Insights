import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import {
  getDistrictOverview,
  logAccess,
  type OverviewItem,
} from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { DistBar } from "@/components/DistBar";
import { SampleSize } from "@/components/Sample";
import { deltaArrow, formatDelta, statusLabel } from "@/lib/format";

function DeltaCell({ value }: { value: number | null }) {
  return (
    <span className="tabular-nums">
      {formatDelta(value)}{" "}
      <span className="text-xs text-muted">{deltaArrow(value)}</span>
    </span>
  );
}

function ItemsTable({
  items,
  districtId,
}: {
  items: OverviewItem[];
  districtId: string;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-brand-50 text-left text-xs uppercase tracking-wide text-muted">
          <th className="px-4 py-2.5 font-medium">Item</th>
          <th className="px-4 py-2.5 font-medium">Status</th>
          <th className="px-4 py-2.5 text-right font-medium">Mean</th>
          <th className="px-4 py-2.5 font-medium">Distribution (1 to 5)</th>
          <th className="px-4 py-2.5 text-right font-medium">Responses</th>
          <th className="px-4 py-2.5 text-right font-medium">7d</th>
          <th className="px-4 py-2.5 text-right font-medium">30d</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={`${item.kind}:${item.id}`}
            className="border-b border-border last:border-0 hover:bg-brand-50/50"
          >
            <td className="max-w-[480px] px-4 py-2.5">
              <Link
                href={`/districts/${districtId}/items/${item.kind}/${encodeURIComponent(item.id)}`}
                className="font-medium text-brand-800 hover:underline"
              >
                {item.title}
              </Link>
              {item.tracked && (
                <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700">
                  tracked
                </span>
              )}
              <div className="truncate text-xs text-muted">{item.subtitle}</div>
            </td>
            <td className="px-4 py-2.5 capitalize">
              {item.status ? statusLabel(item.status) : ""}
            </td>
            <td className="px-4 py-2.5 text-right">
              {item.stats?.avg_value != null ? (
                <span className="text-base font-semibold tabular-nums text-brand-800">
                  {item.stats.avg_value.toFixed(2)}
                </span>
              ) : (
                <span className="text-xs text-muted">no responses yet</span>
              )}
            </td>
            <td className="px-4 py-2.5">
              <DistBar distribution={item.stats?.distribution ?? null} />
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              {item.stats?.n?.toLocaleString("en-US") ?? 0}
            </td>
            <td className="px-4 py-2.5 text-right">
              <DeltaCell value={item.change7} />
            </td>
            <td className="px-4 py-2.5 text-right">
              <DeltaCell value={item.change30} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ districtId: string }>;
}) {
  const { districtId } = await params;
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const district = ctx.entitledDistricts.find((d) => d.id === districtId);
  if (!district) notFound();

  const items = await getDistrictOverview(ctx.membership.orgId, districtId);
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "district_overview", {
    district_id: districtId,
  });

  const withData = items.filter((i) => (i.stats?.n ?? 0) > 0);
  const totalResponses = withData.reduce((a, i) => a + (i.stats?.n ?? 0), 0);
  const movers = withData
    .filter((i) => i.change7 != null || i.change30 != null)
    .sort(
      (a, b) =>
        Math.max(Math.abs(b.change7 ?? 0), Math.abs(b.change30 ?? 0)) -
        Math.max(Math.abs(a.change7 ?? 0), Math.abs(a.change30 ?? 0))
    )
    .slice(0, 3);

  const sections: { title: string; note: string; items: OverviewItem[] }[] = [
    {
      title: "Rated in this district",
      note: "Every item with live constituent responses, most responses first",
      items: withData,
    },
    {
      title: "Topics",
      note: "Standing topic questions from the Tally app",
      items: items.filter((i) => i.kind === "topic" && (i.stats?.n ?? 0) === 0),
    },
    {
      title: "City and curated bills",
      note: "Curated legislation tracked by Tally",
      items: items.filter((i) => i.kind === "bill" && (i.stats?.n ?? 0) === 0),
    },
    {
      title: "Federal bills (live synced)",
      note: "Synced from Congress, updated automatically",
      items: items.filter(
        (i) => i.kind === "live_bill" && (i.stats?.n ?? 0) === 0
      ),
    },
  ];

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Overview">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-900">
          {district.name}: district overview
        </h1>
        <p className="text-sm text-muted">
          {items.length} rateable items ({withData.length} with responses,{" "}
          {totalResponses.toLocaleString("en-US")} total responses in this
          district). All numbers come from verified constituent ratings in the
          Tally app on a 1 to 5 agree scale.
        </p>
      </div>

      {movers.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Biggest movers
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {movers.map((item) => (
              <Link
                key={`${item.kind}:${item.id}`}
                href={`/districts/${districtId}/items/${item.kind}/${encodeURIComponent(item.id)}`}
                className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-brand-400"
              >
                <div className="mb-1 line-clamp-2 min-h-10 text-sm font-medium">
                  {item.title}
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-semibold tabular-nums text-brand-800">
                      {item.stats?.avg_value?.toFixed(2)}
                    </span>{" "}
                    <SampleSize n={item.stats?.n} />
                  </div>
                  <div className="text-right text-sm">
                    <div>
                      <span className="text-xs text-muted">7d </span>
                      <DeltaCell value={item.change7} />
                    </div>
                    <div>
                      <span className="text-xs text-muted">30d </span>
                      <DeltaCell value={item.change30} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Desktop: full tables per section */}
      <div className="hidden space-y-8 md:block">
        {sections
          .filter((s) => s.items.length > 0)
          .map((s) => (
            <section key={s.title}>
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                  {s.title}
                </h2>
                <span className="text-xs text-muted">
                  {s.items.length} items · {s.note}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <ItemsTable items={s.items} districtId={districtId} />
              </div>
            </section>
          ))}
      </div>

      {/* Mobile: read only summary of items with data */}
      <section className="space-y-3 md:hidden">
        {(withData.length > 0 ? withData : items.slice(0, 25)).map((item) => (
          <Link
            key={`${item.kind}:${item.id}`}
            href={`/districts/${districtId}/items/${item.kind}/${encodeURIComponent(item.id)}`}
            className="block rounded-xl border border-border bg-card p-4"
          >
            <div className="mb-1 text-sm font-medium">{item.title}</div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold tabular-nums text-brand-800">
                {item.stats?.avg_value?.toFixed(2) ?? "no responses yet"}
              </span>
              <SampleSize n={item.stats?.n ?? 0} />
              <span>
                30d <DeltaCell value={item.change30} />
              </span>
            </div>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
