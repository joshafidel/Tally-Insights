import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getBillDetail, logAccess } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { Histogram } from "@/components/charts/Histogram";
import { TrendChart } from "@/components/charts/TrendChart";
import { BreakdownBars, type BreakdownBar } from "@/components/BreakdownBars";
import { SampleSize, Suppressed } from "@/components/Sample";
import { PARTY_COLOR, PARTY_LABEL, SEX_LABEL, statusLabel } from "@/lib/format";

const AGE_ORDER = ["18-29", "30-44", "45-64", "65+"];

function ComparisonCard({
  label,
  avg,
  n,
}: {
  label: string;
  avg: number | null | undefined;
  n: number | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      {avg != null ? (
        <div className="text-xl font-semibold tabular-nums text-brand-800">
          {avg.toFixed(2)}{" "}
          <span className="text-xs font-normal text-muted">n={n?.toLocaleString("en-US")}</span>
        </div>
      ) : (
        <div className="pt-1">
          <Suppressed n={n} />
        </div>
      )}
    </div>
  );
}

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ districtId: string; billId: string }>;
}) {
  const { districtId, billId } = await params;
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const district = ctx.entitledDistricts.find((d) => d.id === districtId);
  if (!district) notFound();

  const detail = await getBillDetail(districtId, billId);
  if (!detail.bill) notFound();
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "bill_detail", {
    district_id: districtId,
    bill_id: billId,
  });

  const { bill, sentiment, trend } = detail;

  const partyRows: BreakdownBar[] = ["D", "R", "I"]
    .map((p) => detail.party.find((r) => r.party === p))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.party!,
      label: PARTY_LABEL[r.party!] ?? r.party!,
      avg: r.avg_value,
      n: r.n,
      color: PARTY_COLOR[r.party!] ?? "var(--brand-500)",
    }));

  const ageRows: BreakdownBar[] = AGE_ORDER.map((a) =>
    detail.age.find((r) => r.age_bucket === a)
  )
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.age_bucket!,
      label: r.age_bucket!,
      avg: r.avg_value,
      n: r.n,
      color: "var(--brand-500)",
    }));

  const sexRows: BreakdownBar[] = ["f", "m"]
    .map((s) => detail.sex.find((r) => r.sex === s))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      key: r.sex!,
      label: SEX_LABEL[r.sex!] ?? r.sex!,
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
        <h1 className="mt-2 text-xl font-semibold text-brand-900">{bill.title}</h1>
        <div className="mt-1 text-sm text-muted">
          {bill.chamber} · Sponsor: {bill.sponsor} · Status:{" "}
          <span className="capitalize">{statusLabel(bill.status)}</span>
          {bill.vote_date ? ` · Vote date: ${bill.vote_date}` : ""}
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed">
          {bill.plain_summary}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
            District sentiment
          </h2>
          {sentiment?.avg_value != null ? (
            <>
              <div className="text-4xl font-semibold tabular-nums text-brand-800">
                {sentiment.avg_value.toFixed(2)}
              </div>
              <div className="mt-1">
                <SampleSize n={sentiment.n} />{" "}
                <span className="text-xs text-muted">
                  verified constituent responses
                </span>
              </div>
            </>
          ) : (
            <Suppressed n={sentiment?.n} />
          )}
          <div className="mt-5 grid grid-cols-1 gap-2">
            <ComparisonCard
              label={`District (${district.name})`}
              avg={sentiment?.avg_value}
              n={sentiment?.n}
            />
            <ComparisonCard
              label={`State (${district.state})`}
              avg={detail.state?.avg_value}
              n={detail.state?.n}
            />
            <ComparisonCard
              label="National"
              avg={detail.national?.avg_value}
              n={detail.national?.n}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Response distribution
            </h2>
            <SampleSize n={sentiment?.n} />
          </div>
          {sentiment?.distribution ? (
            <>
              <Histogram distribution={sentiment.distribution} />
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>1 = strongly disagree</span>
                <span>5 = strongly agree</span>
              </div>
            </>
          ) : (
            <Suppressed n={sentiment?.n} />
          )}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            By party
          </h2>
          <BreakdownBars rows={partyRows} />
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            By age bracket
          </h2>
          <BreakdownBars rows={ageRows} />
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            By sex
          </h2>
          <BreakdownBars rows={sexRows} />
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Sentiment trend (cumulative mean by day)
          </h2>
          <span className="text-xs text-muted">
            Dashed line marks neutral (3). Days below the 50 response floor are
            omitted.
          </span>
        </div>
        {trendPoints.some((p) => p.avg != null) ? (
          <TrendChart points={trendPoints} />
        ) : (
          <Suppressed n={sentiment?.n} />
        )}
      </section>
    </AppShell>
  );
}
