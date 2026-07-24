import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAccess } from "@/lib/insights";

export default async function MethodologyPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const { district } = await searchParams;
  const districtId = district ?? ctx.entitledDistricts[0]?.id ?? "nyc";

  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: stats }, ratingsRes, verifiedRes] = await Promise.all([
    supabase.from("insights_item_sentiment").select("district_id, n"),
    admin.from("weigh_ins").select("district_id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("id_on_file", true),
  ]);
  await logAccess(ctx.membership.orgId, ctx.user.id, "view", "methodology");

  const byDistrict = new Map<string, number>();
  for (const s of stats ?? []) {
    byDistrict.set(s.district_id, (byDistrict.get(s.district_id) ?? 0) + s.n);
  }
  const totalRatings = ratingsRes.count ?? 0;
  const verifiedUsers = verifiedRes.count ?? 0;

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Methodology">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-xl font-semibold text-brand-900">
          Methodology
        </h1>
        <p className="mb-8 text-sm text-muted">
          How Tally Insights numbers are produced, what they can support, and
          what they cannot. Written to be handed to a reporter as is.
        </p>

        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold text-brand-800">
            Where the data comes from
          </h2>
          <p className="text-sm leading-relaxed">
            Every sentiment number in this product is an aggregate of
            individual ratings submitted in the Tally consumer app. Users rate
            legislation and standing topics on a 1 to 5 scale, where 1 means
            strongly disagree and 5 means strongly agree. Bill text and status
            for federal legislation are synced automatically from official
            Congress sources. Officials&apos; votes are recorded from public
            roll calls. Nothing in this product is polled, modeled, or
            extrapolated: if a number is shown, real people produced it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold text-brand-800">
            Verification
          </h2>
          <p className="text-sm leading-relaxed">
            Tally verifies constituents at signup by scanning a government
            issued ID, which confirms district residency before any rating
            counts. {verifiedUsers.toLocaleString("en-US")}{" "}
            {verifiedUsers === 1 ? "user has" : "users have"} completed ID
            verification to date. Ratings are tied to the district on file at
            the time of rating; council sub districts roll up to their city.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold text-brand-800">
            Current sample sizes
          </h2>
          <p className="mb-3 text-sm leading-relaxed">
            Tally is early. Sample sizes are small and shown beside every
            number in the product, without exception. As of today:
          </p>
          <table className="w-full max-w-md text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">District</th>
                <th className="py-2 text-right font-medium">Total responses</th>
              </tr>
            </thead>
            <tbody>
              {[...byDistrict.entries()].map(([d, n]) => (
                <tr key={d} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{d}</td>
                  <td className="py-2 text-right tabular-nums">{n.toLocaleString("en-US")}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-3 font-medium">All districts</td>
                <td className="py-2 text-right font-medium tabular-nums">
                  {totalRatings.toLocaleString("en-US")}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold text-brand-800">
            Weighting
          </h2>
          <p className="text-sm leading-relaxed">
            None. Numbers are unweighted means of verified ratings. No
            demographic weighting, likely voter screens, or house effects are
            applied. When sample sizes grow enough to support weighting, any
            change will be documented here first.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold text-brand-800">
            Small samples and privacy
          </h2>
          <p className="text-sm leading-relaxed">
            Sample size appears beside every number so readers can judge
            reliability themselves. Means built on fewer than 50 responses are
            labeled low sample and should be read as directional. Individual
            ratings are never shown or sold: everything in this product is an
            aggregate, party breakdowns require at least 5 responses per cell
            before alignment scoring, and officials&apos; votes are scored
            against district sentiment only once a bill has at least 5
            district responses. Age and sex breakdowns are not yet available
            because the consumer app does not collect them at signup.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold text-brand-800">
            How alignment is scored
          </h2>
          <p className="text-sm leading-relaxed">
            Each curated bill records which roll call vote (yea or nay)
            corresponds to agreeing with it. An official&apos;s vote is mapped
            onto the rating scale: voting the agree direction counts as 5,
            voting the other way counts as 1. The gap is the absolute distance
            between that position and the district mean, from 0 to 4. A vote is
            aligned when it lands on the same side of neutral (3) as the
            district mean. Abstentions and absences are listed but never
            scored.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold text-brand-800">
            Known limitations
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              Samples are currently very small and concentrated in New York
              City. Numbers will move a lot as participation grows: that is
              expected behavior for live data, not an error.
            </li>
            <li>
              Tally users self select into the app. Verified residency is not
              a probability sample, and means should not be read as district
              wide vote shares.
            </li>
            <li>
              Party affiliation is known only for users who state it; ratings
              from users without a stated party appear as party not stated.
            </li>
            <li>
              State and national rollups reflect only districts where Tally is
              active.
            </li>
            <li>
              A synthetic demonstration dataset used during development exists
              in the database but is excluded from every number this product
              displays.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-brand-800">
            Questions
          </h2>
          <p className="text-sm leading-relaxed">
            Methodology questions or corrections: contact the Tally team
            through your account representative. This page changes only with
            versioned releases of the product.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
