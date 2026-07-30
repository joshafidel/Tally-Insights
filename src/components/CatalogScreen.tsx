import Link from "next/link";
import type { OrgContext } from "@/lib/org";
import type { ItemKind, OverviewItem } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { DistBar } from "@/components/DistBar";
import { PartyFilter } from "@/components/PartyFilter";
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

export function CatalogScreen({
  ctx,
  district,
  items,
  party,
  active,
  title,
  description,
  sections,
  basePath,
}: {
  ctx: OrgContext;
  district: { id: string; name: string };
  items: OverviewItem[];
  party?: string;
  active: string;
  title: string;
  description: string;
  sections: { title: string; note: string; kinds: ItemKind[] }[];
  basePath: string;
}) {
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

  const partyLabel =
    party === "D"
      ? "Democratic"
      : party === "R"
        ? "Republican"
        : party === "I"
          ? "Independent"
          : null;

  return (
    <AppShell ctx={ctx} districtId={district.id} active={active}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
            {district.name}: {title}
          </h1>
          <p className="text-sm text-muted">
            {partyLabel
              ? `${partyLabel} sentiment only. Trend columns reflect all voters.`
              : description}
          </p>
        </div>
        <PartyFilter basePath={basePath} current={party ?? "all"} />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: `Total ${title}`, value: items.length },
          { label: "With responses", value: withData.length },
          {
            label: partyLabel ? `${partyLabel} responses` : "Total responses",
            value: totalResponses,
          },
          {
            label: "Tracked by your org",
            value: items.filter((i) => i.tracked).length,
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

      {movers.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Biggest movers
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {movers.map((item) => (
              <Link
                key={`${item.kind}:${item.id}`}
                href={`/districts/${district.id}/items/${item.kind}/${encodeURIComponent(item.id)}`}
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

      {/* Desktop tables */}
      <div className="hidden space-y-8 md:block">
        {[
          {
            title: "Rated in this district",
            note: "Most responses first",
            rows: withData,
          },
          ...sections.map((s) => ({
            title: s.title,
            note: s.note,
            rows: items.filter(
              (i) => s.kinds.includes(i.kind) && (i.stats?.n ?? 0) === 0
            ),
          })),
        ]
          .filter((s) => s.rows.length > 0)
          .map((s) => (
            <section key={s.title}>
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                  {s.title}
                </h2>
                <span className="text-xs text-muted">
                  {s.rows.length} items · {s.note}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <ItemsTable items={s.rows} districtId={district.id} />
              </div>
            </section>
          ))}
      </div>

      {/* Mobile read only summary */}
      <section className="space-y-3 md:hidden">
        {(withData.length > 0 ? withData : items.slice(0, 25)).map((item) => (
          <Link
            key={`${item.kind}:${item.id}`}
            href={`/districts/${district.id}/items/${item.kind}/${encodeURIComponent(item.id)}`}
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
