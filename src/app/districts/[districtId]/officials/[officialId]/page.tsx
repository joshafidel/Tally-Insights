import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getAlignment, logAccess } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { Scorecard, type OfficialSummary } from "@/components/OfficialPicker";
import { HOUSE_DISTRICT } from "@/lib/houseDistricts";
import { districtLabel } from "@/lib/filters";

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-d)",
  R: "var(--party-r)",
  I: "var(--party-i)",
  ID: "var(--party-i)",
};


export async function generateMetadata({
  params,
}: {
  params: Promise<{ districtId: string; officialId: string }>;
}) {
  const { officialId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("insights_member_directory")
    .select("member_name")
    .eq("member_key", decodeURIComponent(officialId))
    .maybeSingle();
  return { title: data?.member_name ?? "Official profile" };
}

export default async function OfficialProfilePage({
  params,
}: {
  params: Promise<{ districtId: string; officialId: string }>;
}) {
  const { districtId, officialId: raw } = await params;
  const officialId = decodeURIComponent(raw);
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const district = ctx.entitledDistricts.find((d) => d.id === districtId);
  if (!district) notFound();

  const supabase = await createClient();
  const [alignmentRows, { data: member }, { data: votes }] = await Promise.all([
    getAlignment(ctx.entitledDistricts.map((d) => d.id)),
    supabase
      .from("insights_member_directory")
      .select("*")
      .eq("member_key", officialId)
      .maybeSingle(),
    supabase
      .from("official_votes_live")
      .select("vote_date, question, bill_label, bill_title, vote_cast, result")
      .eq("member_key", officialId)
      .order("vote_date", { ascending: false })
      .limit(40),
  ]);

  const curatedRows = alignmentRows.filter((r) => r.official_id === officialId);
  if (!member && curatedRows.length === 0) notFound();
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "official_profile", {
    official_id: officialId,
  });

  const name = member?.member_name ?? curatedRows[0]?.official_name ?? officialId;
  const party = member?.party ?? curatedRows[0]?.official_party ?? "I";
  const cd = member?.chamber === "house" ? HOUSE_DISTRICT[officialId] ?? null : null;
  const office = member
    ? member.chamber === "senate"
      ? `Senator, ${member.state}`
      : `Representative, ${cd ? districtLabel(cd) : member.state}`
    : curatedRows[0]?.official_role ?? "";

  const scored = curatedRows.filter((r) => r.alignment !== "not_scored");
  const aligned = scored.filter((r) => r.alignment === "aligned");
  const alignedPct =
    scored.length > 0 ? Math.round((aligned.length / scored.length) * 100) : null;
  const summary: OfficialSummary | null =
    curatedRows.length > 0
      ? {
          id: officialId,
          name,
          party,
          role: office,
          region: member?.state ?? "",
          alignedPct,
          scoredCount: scored.length,
          votes: curatedRows.map((r) => ({
            bill_id: r.bill_id,
            bill_title: r.bill_title,
            vote: r.vote,
            sample_n: r.sample_n,
            district_avg: r.district_avg,
            gap: r.gap,
            alignment: r.alignment,
          })),
        }
      : null;

  const fmtD = (d: string | null) =>
    d
      ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Officials">
      <div className="mb-5">
        <Link
          href={`/districts/${districtId}/officials`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to all officials
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ backgroundColor: PARTY_COLOR[party] ?? "var(--brand-500)" }}
          >
            {name
              .split(/\s+/)
              .map((w: string) => w[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
              {name}
            </h1>
            <div className="text-sm text-muted">
              {office}
              {member?.state ? ` · ${member.state}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Roll call votes on record
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-brand-800">
            {(member?.votes_recorded ?? curatedRows.length).toLocaleString("en-US")}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Yea / Nay
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-brand-800">
            {member ? `${member.yea_votes} / ${member.nay_votes}` : "n/a"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Latest vote
          </div>
          <div className="mt-1 text-lg font-semibold text-brand-800">
            {member?.last_vote_date ? fmtD(member.last_vote_date) : "n/a"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Alignment with district
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-brand-800">
            {alignedPct != null ? `${alignedPct}%` : "not scored"}
          </div>
          {alignedPct != null && (
            <div className="text-xs text-muted">across {scored.length} scored votes</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {summary && (
          <div>
            <Scorecard official={summary} />
          </div>
        )}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Recent roll call votes
          </h2>
          {(votes ?? []).length === 0 ? (
            <p className="text-sm text-muted">
              No live roll call votes recorded for this official.
            </p>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-brand-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Vote</th>
                    <th className="px-2 py-2 font-medium">Cast</th>
                    <th className="px-2 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(votes ?? []).map((v, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-muted">
                        {fmtD(v.vote_date)}
                      </td>
                      <td className="max-w-[320px] px-2 py-2">
                        <div className="truncate" title={v.bill_title ?? v.question ?? ""}>
                          {[v.bill_label, v.bill_title || v.question]
                            .filter(Boolean)
                            .join(": ")}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs font-medium">
                        {v.vote_cast}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted">{v.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
