import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getDistrictOverview, logAccess } from "@/lib/insights";
import { CatalogScreen } from "@/components/CatalogScreen";

export default async function TopicsPage({
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
  const items = all.filter((i) => i.kind === "topic");
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "topics", {
    district_id: districtId,
    party: party ?? "all",
  });

  return (
    <CatalogScreen
      ctx={ctx}
      district={district}
      items={items}
      party={party}
      active="Topics"
      title="topics"
      description="Standing topic questions constituents answer in the Tally app, on a 1 to 5 agree scale."
      sections={[
        {
          title: "All topics",
          note: "Awaiting responses in this district",
          kinds: ["topic"],
        },
      ]}
      basePath={`/districts/${districtId}/topics`}
    />
  );
}
