import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getItemDetail, logAccess, type ItemKind } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { Histogram } from "@/components/charts/Histogram";
import { TrendChart } from "@/components/charts/TrendChart";
import { BreakdownBars, type BreakdownBar } from "@/components/BreakdownBars";
import { DistrictTileMap } from "@/components/DistrictTileMap";
import { SampleSize } from "@/components/Sample";
import { PARTY_COLOR, PARTY_LABEL, statusLabel } from "@/lib/format";

const KINDS: ItemKind[] = ["topic", "bill", "live_bill"];

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ districtId: string; kind: string; itemId: string }>;
}) {
  const { districtId, kind, itemId: rawItemId } = await params;
  const itemId = decodeURIComponent(rawItemId);
  if (!KINDS.includes(kind as ItemKind)) notFound();

  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const district = ctx.entitledDistricts.find((d) => d.id === districtId);
  if (!district) notFound();

  const detail = await getItemDetail(districtId, kind as ItemKind, itemId);
  if (!detail.item) notFound();
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "item_detail", {
    district_id: districtId,
    kind,
    item_id: itemId,
  });

  const { item, stats, trend } = detail;

  const partyOrder = ["D", "R", "I", "U"];
  const partyRows: BreakdownBar[] = partyOrder
    .map((p) => detail.party.find((r) => r.party === p))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.party,
      label:
        r.party === "U" ? "Party not stated" : PARTY_LABEL[r.party] ?? r.party,
      avg: r.avg_value,
      n: r.n,
      color:
        r.party === "U" ? "var(--brand-300)" : PARTY_COLOR[r.party] ?? "var(--brand-500)",
    }));

  const AGE_ORDER = ["18-29", "30-44", "45-64", "65+", "unknown"];
  const ageBracketBars: BreakdownBar[] = AGE_ORDER.map((a) =>
    detail.ageBrackets.find((r) => r.age_bucket === a)
  )
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.age_bucket!,
      label: r.age_bucket === "unknown" ? "Age unknown" : r.age_bucket!,
      avg: r.avg_value,
      n: r.n,
      color: "var(--brand-500)",
    }));

  const SEX_ORDER = ["f", "m", "x", "unknown"];
  const SEX_LABELS: Record<string, string> = {
    f: "Women",
    m: "Men",
    x: "X on ID",
    unknown: "Not collected",
  };
  const sexBars: BreakdownBar[] = SEX_ORDER.map((s) =>
    detail.sexRows.find((r) => r.sex === s)
  )
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.sex!,
      label: SEX_LABELS[r.sex!] ?? r.sex!,
      avg: r.avg_value,
      n: r.n,
      color: "var(--brand-500)",
    }));

  const raceBars: BreakdownBar[] = detail.raceRows.map((r) => ({
    key: r.race!,
    label: r.race === "unknown" ? "Not stated" : r.race!,
    avg: r.avg_value,
    n: r.n,
    color: "var(--brand-500)",
  }));

  const trendPoints = trend.map((p) => ({
    day: p.day,
    avg: p.avg_value,
    n: p.n,
  }));

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Overview">
      <div className="mb-6">
        <Link
          href={`/districts/${districtId}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to {district.name} overview
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-brand-900">{item.title}</h1>
        <div className="mt-1 text-sm text-muted">
          {item.subtitle}
          {item.status ? (
            <>
              {" "}
              · Status: <span className="capitalize">{statusLabel(item.status)}</span>
            </>
          ) : null}
        </div>
        {item.summary && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed">{item.summary}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
            District sentiment
          </h2>
          {stats?.avg_value != null ? (
            <>
              <div className="text-4xl font-semibold tabular-nums text-brand-800">
                {stats.avg_value.toFixed(2)}
              </div>
              <div className="mt-1">
                <SampleSize n={stats.n} />{" "}
                <span className="text-xs text-muted">
                  verified constituent responses
                </span>
              </div>
              {stats.low_sample && (
                <div className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
                  Low sample: fewer than 50 responses. Directional only,
                  interpret with caution.
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              No responses yet in {district.name}. This item appears to
              constituents in the Tally app; sentiment fills in as they weigh
              in.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Response distribution
            </h2>
            <SampleSize n={stats?.n ?? 0} />
          </div>
          {stats?.distribution ? (
            <>
              <Histogram distribution={stats.distribution} />
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>1 = strongly disagree</span>
                <span>5 = strongly agree</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No responses yet.</p>
          )}
        </section>
      </div>

      {/* Who is weighing in: the five breakdowns a legislative office needs */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            By party
          </h2>
          {partyRows.length > 0 ? (
            <BreakdownBars rows={partyRows} />
          ) : (
            <p className="text-sm text-muted">No responses yet.</p>
          )}
          <p className="mt-4 text-xs text-muted">
            Party not stated means the rater has not declared one in the app.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            By age bracket
          </h2>
          {ageBracketBars.length > 0 ? (
            <BreakdownBars rows={ageBracketBars} />
          ) : (
            <p className="text-sm text-muted">No responses yet.</p>
          )}
          <p className="mt-4 text-xs text-muted">
            Ages come from birth year captured at ID verification. Unknown
            means verification predates collection.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            By sex
          </h2>
          {sexBars.length > 0 ? (
            <BreakdownBars rows={sexBars} />
          ) : (
            <p className="text-sm text-muted">No responses yet.</p>
          )}
          <p className="mt-4 text-xs text-muted">
            Sex as listed on ID at verification. Unknown means not yet
            collected for that rater.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            By race
          </h2>
          {raceBars.length > 0 ? (
            <BreakdownBars rows={raceBars} />
          ) : (
            <p className="text-sm text-muted">No responses yet.</p>
          )}
          <p className="mt-4 text-xs text-muted">
            Race is self reported and optional. Unknown means the rater has
            not answered.
          </p>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            District consensus map
          </h2>
          <span className="text-xs text-muted">
            Every district reporting on this item, shaded by mean sentiment
          </span>
        </div>
        {!ctx.features.includes("district_exact") ? (
          <p className="text-sm text-muted">
            District level maps are available on a higher tier. Contact your
            Tally account representative to enable them.
          </p>
        ) : detail.exactDistricts.length > 0 ? (
          <DistrictTileMap
            rows={detail.exactDistricts}
            rootDistrictName={district.name}
          />
        ) : (
          <p className="text-sm text-muted">
            No district level responses for this item yet. Tiles appear as
            constituents in each district weigh in.
          </p>
        )}
      </section>

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

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-brand-300 bg-gradient-to-b from-card to-brand-50/60 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              By exact age (year)
            </h2>
            <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Premium
            </span>
          </div>
          {!ctx.features.includes("age_exact") ? (
            <p className="text-sm text-muted">
              Exact age breakdowns are available on a higher tier. Contact your
              Tally account representative to enable them.
            </p>
          ) : detail.ageYears.length > 0 ? (
            <table className="w-full max-w-sm text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Age</th>
                  <th className="py-2 pr-3 text-right font-medium">Mean</th>
                  <th className="py-2 text-right font-medium">Responses</th>
                </tr>
              </thead>
              <tbody>
                {detail.ageYears.map((r) => (
                  <tr key={r.age_years} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{r.age_years}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums text-brand-800">
                      {r.avg_value?.toFixed(2)}
                    </td>
                    <td className="py-2 text-right tabular-nums">n={r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">
              Enabled for your org. Birth years arrive as verified users
              complete ID verification in the Tally app; rows appear here
              automatically.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-brand-300 bg-gradient-to-b from-card to-brand-50/60 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              By exact district
            </h2>
            <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Premium
            </span>
          </div>
          {!ctx.features.includes("district_exact") ? (
            <p className="text-sm text-muted">
              Sub district breakdowns are available on a higher tier. Contact
              your Tally account representative to enable them.
            </p>
          ) : detail.exactDistricts.length > 0 ? (
            <table className="w-full max-w-sm text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">District</th>
                  <th className="py-2 pr-3 text-right font-medium">Mean</th>
                  <th className="py-2 text-right font-medium">Responses</th>
                </tr>
              </thead>
              <tbody>
                {detail.exactDistricts.map((r) => (
                  <tr key={r.district_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{r.district_id}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums text-brand-800">
                      {r.avg_value?.toFixed(2)}
                    </td>
                    <td className="py-2 text-right tabular-nums">n={r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">
              Enabled for your org. No sub district responses for this item
              yet.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
