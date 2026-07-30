import { redirect } from "next/navigation";

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ districtId: string }>;
}) {
  const { districtId } = await params;
  redirect(`/districts/${districtId}/topics`);
}
