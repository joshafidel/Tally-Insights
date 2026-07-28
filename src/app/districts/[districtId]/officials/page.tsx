import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getAlignment, logAccess, type AlignmentRow } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import {
  OfficialPicker,
  type OfficialSummary,
} from "@/components/OfficialPicker";

function regionOf(row: AlignmentRow, districtName: string): string {
  const comma = row.official_role.lastIndexOf(", ");
  if (comma > 0) return row.official_role.slice(comma + 2);
  return districtName;
}

function positionOf(row: AlignmentRow): string {
  const comma = row.official_role.lastIndexOf(", ");
  if (comma > 0) return row.official_role.slice(0, comma);
  return row.official_role;
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

  // All entitled districts: every politician the org can see is searchable
  // from here, not just the current district's.
  const rows = await getAlignment(ctx.entitledDistricts.map((d) => d.id));
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "officials", {
    district_id: districtId,
  });

  const byOfficial = new Map<string, AlignmentRow[]>();
  for (const r of rows) {
    const arr = byOfficial.get(r.official_id) ?? [];
    arr.push(r);
    byOfficial.set(r.official_id, arr);
  }

  const officials: OfficialSummary[] = [...byOfficial.entries()].map(
    ([id, officialRows]) => {
      const first = officialRows[0];
      const scored = officialRows.filter((r) => r.alignment !== "not_scored");
      const aligned = scored.filter((r) => r.alignment === "aligned");
      const districtName =
        ctx.entitledDistricts.find((d) => d.id === first.district_id)?.name ??
        first.district_id;
      return {
        id,
        name: first.official_name,
        party: first.official_party,
        role: positionOf(first),
        region: regionOf(first, districtName),
        alignedPct:
          scored.length > 0
            ? Math.round((aligned.length / scored.length) * 100)
            : null,
        scoredCount: scored.length,
        votes: officialRows.map((r) => ({
          bill_id: r.bill_id,
          bill_title: r.bill_title,
          vote: r.vote,
          sample_n: r.sample_n,
          district_avg: r.district_avg,
          gap: r.gap,
          alignment: r.alignment,
        })),
      };
    }
  );

  // Current district's officials first, largest gaps first within each group
  officials.sort((a, b) => {
    const aLocal = rows.find((r) => r.official_id === a.id)?.district_id === districtId;
    const bLocal = rows.find((r) => r.official_id === b.id)?.district_id === districtId;
    if (aLocal !== bLocal) return aLocal ? -1 : 1;
    return (b.alignedPct == null ? -1 : 100 - b.alignedPct) -
      (a.alignedPct == null ? -1 : 100 - a.alignedPct);
  });

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Officials">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-900">
          Official alignment
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          Search any politician, or pick one from the dropdown, to see their
          scorecard: every recorded roll call vote compared with live district
          sentiment from the Tally app. Votes score once a bill has 5 or more
          district responses; the gap measures how far the vote sits from the
          district mean on the 1 to 5 scale.
        </p>
      </div>
      {officials.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted">
          No officials are linked to your entitled districts yet.
        </div>
      ) : (
        <OfficialPicker officials={officials} />
      )}
    </AppShell>
  );
}
