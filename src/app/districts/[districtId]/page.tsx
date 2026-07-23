import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

// Checkpoint B stub: proves the auth, org, entitlement, and aggregate view
// path end to end. The full district overview screen replaces this in
// checkpoint C.
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

  const supabase = await createClient();
  const { count } = await supabase
    .from("insights_bill_sentiment")
    .select("bill_id", { count: "exact", head: true })
    .eq("district_id", districtId);

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-6">
      <header className="mb-8 flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="text-lg font-semibold text-brand-800">
            Tally Insights
          </div>
          <div className="text-sm text-muted">
            {ctx.membership.orgName}: {district.name}
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-brand-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-1 text-base font-medium text-brand-800">
          Connected to live district data
        </div>
        <p className="text-sm text-muted">
          {count ?? 0} bills currently have sentiment aggregates for{" "}
          {district.name}. The full district overview arrives in the next
          checkpoint.
        </p>
      </div>
    </main>
  );
}
