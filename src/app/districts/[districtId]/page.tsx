import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getDistrictOverview, logAccess } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { DistBar } from "@/components/DistBar";
import { SampleSize, Suppressed } from "@/components/Sample";
import { deltaArrow, formatDelta, statusLabel } from "@/lib/format";

function DeltaCell({ value }: { value: number | null }) {
  return (
    <span className="tabular-nums">
      {formatDelta(value)}{" "}
      <span className="text-xs text-muted">{deltaArrow(value)}</span>
    </span>
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

  const { rows } = await getDistrictOverview(ctx.membership.orgId, districtId);
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "district_overview", {
    district_id: districtId,
  });

  const movers = rows
    .filter((r) => (r.change7 ?? r.change30) != null)
    .slice(0, 3);

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Overview">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-900">
          {district.name}: district overview
        </h1>
        <p className="text-sm text-muted">
          {rows.length} tracked bills. Sentiment is the mean of verified
          constituent ratings on a 1 to 5 agree scale. Changes are movement in
          the cumulative mean over the trailing window.
        </p>
      </div>

      {movers.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Biggest movers
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {movers.map(({ bill, sentiment, change7, change30 }) => (
              <Link
                key={bill.id}
                href={`/districts/${districtId}/bills/${bill.id}`}
                className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-brand-400"
              >
                <div className="mb-1 line-clamp-2 min-h-10 text-sm font-medium">
                  {bill.title}
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-semibold tabular-nums text-brand-800">
                      {sentiment?.avg_value?.toFixed(2) ?? ""}
                    </span>{" "}
                    {sentiment?.avg_value == null ? (
                      <Suppressed n={sentiment?.n} />
                    ) : (
                      <SampleSize n={sentiment?.n} />
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <div>
                      <span className="text-xs text-muted">7d </span>
                      <DeltaCell value={change7} />
                    </div>
                    <div>
                      <span className="text-xs text-muted">30d </span>
                      <DeltaCell value={change30} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <div className="mb-1 font-medium text-brand-800">
            No bills tracked for this district yet
          </div>
          <p className="text-sm text-muted">
            The watchlist screen (arriving in a later checkpoint) is where
            owners and admins add bills to track.
          </p>
        </div>
      ) : (
        <>
          {/* Full table: desktop */}
          <section className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-brand-50 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Bill</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Sentiment</th>
                  <th className="px-4 py-3 font-medium">Distribution (1 to 5)</th>
                  <th className="px-4 py-3 text-right font-medium">Responses</th>
                  <th className="px-4 py-3 text-right font-medium">7d change</th>
                  <th className="px-4 py-3 text-right font-medium">30d change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ bill, sentiment, change7, change30 }) => (
                  <tr
                    key={bill.id}
                    className="border-b border-border last:border-0 hover:bg-brand-50/50"
                  >
                    <td className="max-w-[420px] px-4 py-3">
                      <Link
                        href={`/districts/${districtId}/bills/${bill.id}`}
                        className="font-medium text-brand-800 hover:underline"
                      >
                        {bill.title}
                      </Link>
                      <div className="text-xs text-muted">
                        {bill.chamber} · {bill.sponsor}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {statusLabel(bill.status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sentiment?.avg_value != null ? (
                        <span className="text-base font-semibold tabular-nums text-brand-800">
                          {sentiment.avg_value.toFixed(2)}
                        </span>
                      ) : (
                        <Suppressed n={sentiment?.n} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DistBar distribution={sentiment?.distribution ?? null} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {sentiment?.n?.toLocaleString("en-US") ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeltaCell value={change7} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeltaCell value={change30} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Read only summary: mobile */}
          <section className="space-y-3 md:hidden">
            {rows.map(({ bill, sentiment, change30 }) => (
              <Link
                key={bill.id}
                href={`/districts/${districtId}/bills/${bill.id}`}
                className="block rounded-xl border border-border bg-card p-4"
              >
                <div className="mb-1 text-sm font-medium">{bill.title}</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold tabular-nums text-brand-800">
                    {sentiment?.avg_value?.toFixed(2) ?? "insufficient sample"}
                  </span>
                  <SampleSize n={sentiment?.n} />
                  <span>
                    30d <DeltaCell value={change30} />
                  </span>
                </div>
              </Link>
            ))}
          </section>
        </>
      )}
    </AppShell>
  );
}
