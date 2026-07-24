import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getAlignment, logAccess, type AlignmentRow } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { PARTY_COLOR } from "@/lib/format";

const ALIGNMENT_LABEL: Record<string, string> = {
  aligned: "Aligned with district",
  against_district_support: "Voted against what the district supports",
  with_what_district_opposes: "Voted for what the district opposes",
  district_neutral: "District neutral",
  not_scored: "Not scored",
};

function PartyChip({ party }: { party: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: PARTY_COLOR[party] ?? "var(--brand-400)" }}
      title={party}
    >
      {party}
    </span>
  );
}

function OfficialCard({ name, rows }: { name: string; rows: AlignmentRow[] }) {
  const first = rows[0];
  const scored = rows.filter((r) => r.alignment !== "not_scored");
  const aligned = scored.filter((r) => r.alignment === "aligned");
  const pct = scored.length > 0 ? Math.round((aligned.length / scored.length) * 100) : null;
  const sorted = [...rows].sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1));

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PartyChip party={first.official_party} />
            <h2 className="text-base font-semibold text-brand-900">{name}</h2>
          </div>
          <div className="text-sm text-muted">{first.official_role}</div>
        </div>
        <div className="text-right">
          {pct != null ? (
            <>
              <div className="text-2xl font-semibold tabular-nums text-brand-800">
                {pct}%
              </div>
              <div className="text-xs text-muted">
                aligned on {scored.length} scored{" "}
                {scored.length === 1 ? "vote" : "votes"}
              </div>
            </>
          ) : (
            <div className="max-w-40 text-right text-xs text-muted">
              No votes scored yet: needs 5+ district responses on a voted bill
            </div>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Bill</th>
            <th className="py-2 pr-3 font-medium">Vote</th>
            <th className="py-2 pr-3 text-right font-medium">District mean</th>
            <th className="py-2 pr-3 text-right font-medium">Gap</th>
            <th className="py-2 font-medium">Call</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.bill_id} className="border-b border-border last:border-0">
              <td className="max-w-[280px] py-2 pr-3">
                <div className="truncate" title={r.bill_title}>
                  {r.bill_title}
                </div>
              </td>
              <td className="py-2 pr-3 capitalize">{r.vote}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {r.district_avg != null ? (
                  <>
                    {r.district_avg.toFixed(2)}{" "}
                    <span className="text-xs text-muted">n={r.sample_n}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted">n={r.sample_n}</span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {r.gap != null ? r.gap.toFixed(2) : ""}
              </td>
              <td className="py-2">
                <span
                  className={
                    r.alignment === "aligned"
                      ? "rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-800"
                      : r.alignment === "not_scored"
                        ? "text-xs text-muted"
                        : "rounded bg-brand-800 px-1.5 py-0.5 text-xs font-medium text-white"
                  }
                >
                  {ALIGNMENT_LABEL[r.alignment] ?? r.alignment}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function OfficialsPage({
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

  const rows = await getAlignment([districtId]);
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "officials", {
    district_id: districtId,
  });

  const byOfficial = new Map<string, AlignmentRow[]>();
  for (const r of rows) {
    const arr = byOfficial.get(r.official_name) ?? [];
    arr.push(r);
    byOfficial.set(r.official_name, arr);
  }
  const officials = [...byOfficial.entries()].sort((a, b) => {
    const maxGap = (rs: AlignmentRow[]) => Math.max(...rs.map((r) => r.gap ?? -1));
    return maxGap(b[1]) - maxGap(a[1]);
  });

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Officials">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-900">
          {district.name}: official alignment
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          Each official&apos;s roll call votes on curated bills, compared with
          live district sentiment from the Tally app. The gap maps the vote
          onto the 1 to 5 scale (voting the agree direction counts as 5, the
          opposite as 1) and measures its distance from the district mean.
          Votes are scored once a bill has 5 or more district responses.
          Officials with the largest gaps come first.
        </p>
      </div>

      {officials.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted">
          No officials are linked to this district yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {officials.map(([name, officialRows]) => (
            <OfficialCard key={name} name={name} rows={officialRows} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
