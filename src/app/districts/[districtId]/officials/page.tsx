import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getAlignment, logAccess, type AlignmentRow } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import {
  OfficialsDirectory,
  type DirectoryEntry,
} from "@/components/OfficialsDirectory";
import type { OfficialSummary } from "@/components/OfficialPicker";
import { HOUSE_DISTRICT } from "@/lib/houseDistricts";

const STATE_ABBR: Record<string, string> = {
  "New York": "NY", Vermont: "VT", Massachusetts: "MA", Pennsylvania: "PA",
  Georgia: "GA", Louisiana: "LA", California: "CA", Kentucky: "KY",
  Maine: "ME", Texas: "TX", Ohio: "OH", Manhattan: "NY", Queens: "NY",
  Brooklyn: "NY", Bronx: "NY",
};

function positionOf(role: string): string {
  const comma = role.lastIndexOf(", ");
  return comma > 0 ? role.slice(0, comma) : role;
}
function regionOf(role: string, fallback: string): string {
  const comma = role.lastIndexOf(", ");
  return comma > 0 ? role.slice(comma + 2) : fallback;
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

  const supabase = await createClient();
  const [alignmentRows, { data: members }, { data: memberVotes }] =
    await Promise.all([
      getAlignment(ctx.entitledDistricts.map((d) => d.id)),
      supabase
        .from("insights_member_directory")
        .select("*")
        .limit(1000),
      supabase
        .from("insights_member_recent_votes")
        .select("*")
        .order("vote_date", { ascending: false })
        .limit(5000),
    ]);
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "officials", {
    district_id: districtId,
  });

  const votesByMember = new Map<string, NonNullable<typeof memberVotes>>();
  for (const v of memberVotes ?? []) {
    const arr = votesByMember.get(v.member_key) ?? [];
    if (arr.length < 5) {
      arr.push(v);
      votesByMember.set(v.member_key, arr);
    }
  }

  // Curated officials with alignment scorecards
  const byOfficial = new Map<string, AlignmentRow[]>();
  for (const r of alignmentRows) {
    const arr = byOfficial.get(r.official_id) ?? [];
    arr.push(r);
    byOfficial.set(r.official_id, arr);
  }
  const curatedEntries: DirectoryEntry[] = [...byOfficial.entries()].map(
    ([id, rows]) => {
      const first = rows[0];
      const scored = rows.filter((r) => r.alignment !== "not_scored");
      const aligned = scored.filter((r) => r.alignment === "aligned");
      const alignedPct =
        scored.length > 0
          ? Math.round((aligned.length / scored.length) * 100)
          : null;
      const districtName =
        ctx.entitledDistricts.find((d) => d.id === first.district_id)?.name ??
        first.district_id;
      const office = positionOf(first.official_role);
      const region = regionOf(first.official_role, districtName);
      const isStateLocal =
        /state|assembly|council|mayor|advocate|speaker/i.test(
          first.official_role
        );
      const level = isStateLocal
        ? ("state_local" as const)
        : /senator/i.test(office)
          ? ("senate" as const)
          : /representative/i.test(office)
            ? ("house" as const)
            : ("state_local" as const);
      const summary: OfficialSummary = {
        id,
        name: first.official_name,
        party: first.official_party,
        role: office,
        region,
        alignedPct,
        scoredCount: scored.length,
        votes: rows.map((r) => ({
          bill_id: r.bill_id,
          bill_title: r.bill_title,
          vote: r.vote,
          sample_n: r.sample_n,
          district_avg: r.district_avg,
          gap: r.gap,
          alignment: r.alignment,
        })),
      };
      const districtMatch = region.match(/^([A-Z]{2})-\d+/);
      const stateGuess = districtMatch
        ? districtMatch[1]
        : region.length === 2
          ? region.toUpperCase()
          : (STATE_ABBR[region] ?? (district.state === "US" ? "NY" : district.state));
      return {
        id,
        name: first.official_name,
        party: first.official_party,
        office,
        state: stateGuess,
        district: districtMatch
          ? `${districtMatch[1].toLowerCase()}-cd-${parseInt(region.split("-")[1], 10)}`
          : null,
        level,
        votesRecorded: rows.length,
        lastVoteDate: null,
        alignedPct,
        curated: summary,
        recentVotes: [],
      };
    }
  );

  // Dedupe curated federal officials against the roll call roster by last
  // name + state (nicknames like Chuck vs Charles defeat full name matching).
  // The merged entry keeps the curated scorecard and gains the live vote
  // record.
  const lastName = (n: string) => n.trim().split(/\s+/).slice(-1)[0].toLowerCase();
  const mergedMemberKeys = new Set<string>();
  for (const c of curatedEntries) {
    if (c.level !== "senate" && c.level !== "house") continue;
    const hit = (members ?? []).find(
      (m) =>
        (m.chamber === "senate" ? "senate" : "house") === c.level &&
        m.state === c.state &&
        lastName(m.member_name ?? "") === lastName(c.name)
    );
    if (hit) {
      mergedMemberKeys.add(hit.member_key);
      c.votesRecorded = hit.votes_recorded;
      c.lastVoteDate = hit.last_vote_date;
      c.recentVotes = (votesByMember.get(hit.member_key) ?? []).map((v) => ({
        vote_date: v.vote_date,
        bill_title: v.bill_title,
        question: v.question,
        vote_cast: v.vote_cast,
      }));
    }
  }

  const memberEntries: DirectoryEntry[] = (members ?? [])
    .filter((m) => !mergedMemberKeys.has(m.member_key))
    .map((m) => ({
      id: m.member_key,
      name: m.member_name ?? m.member_key,
      party: m.party ?? "I",
      office:
        m.chamber === "senate"
          ? "Senator"
          : HOUSE_DISTRICT[m.member_key]
            ? `Representative, ${(HOUSE_DISTRICT[m.member_key].split("-")[0] ?? "").toUpperCase()}-${HOUSE_DISTRICT[m.member_key].split("-")[2]}`
            : "Representative",
      state: m.state ?? "",
      district: m.chamber === "house" ? HOUSE_DISTRICT[m.member_key] ?? null : null,
      level: m.chamber === "senate" ? ("senate" as const) : ("house" as const),
      votesRecorded: m.votes_recorded,
      lastVoteDate: m.last_vote_date,
      alignedPct: null,
      curated: null,
      recentVotes: (votesByMember.get(m.member_key) ?? []).map((v) => ({
        vote_date: v.vote_date,
        bill_title: v.bill_title,
        question: v.question,
        vote_cast: v.vote_cast,
      })),
    }));

  const entries = [...curatedEntries, ...memberEntries];
  const senateCount = (members ?? []).filter((m) => m.chamber === "senate").length;
  const houseCount = (members ?? []).filter((m) => m.chamber === "house").length;
  const stateLocalCount = entries.filter((e) => e.level === "state_local").length;
  const formerCount = entries.length - senateCount - houseCount - stateLocalCount;

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Officials">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
          Officials
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          {entries.length.toLocaleString("en-US")} officials on file: all{" "}
          {senateCount} sitting senators, all {houseCount} representatives,{" "}
          {stateLocalCount} state and local officials tracked by Tally
          {formerCount > 0
            ? `, and ${formerCount} former ${formerCount === 1 ? "member" : "members"} with recorded votes`
            : ""}
          . Search, sort, filter, or click a state on the map. Rosters and
          vote records come from live synced roll calls.
        </p>
      </div>
      <OfficialsDirectory entries={entries} />
    </AppShell>
  );
}
