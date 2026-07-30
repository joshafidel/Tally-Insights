import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getDistrictOverview, logAccess } from "@/lib/insights";
import { CatalogScreen } from "@/components/CatalogScreen";

export default async function BillsPage({
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
  const items = all.filter((i) => i.kind === "bill" || i.kind === "live_bill");
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "bills", {
    district_id: districtId,
    party: party ?? "all",
  });

  return (
    <CatalogScreen
      ctx={ctx}
      district={district}
      items={items}
      party={party}
      active="Bills"
      title="bills"
      description="Curated city and national legislation plus live synced federal bills, rated by verified constituents on a 1 to 5 agree scale."
      sections={[
        {
          title: "City and curated bills",
          note: "Curated legislation tracked by Tally",
          kinds: ["bill"],
        },
        {
          title: "Federal bills (live synced)",
          note: "Synced from Congress, updated automatically",
          kinds: ["live_bill"],
        },
      ]}
      basePath={`/districts/${districtId}/bills`}
    />
  );
}
