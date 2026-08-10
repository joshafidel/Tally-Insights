import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
};

const H = "mt-8 text-lg font-semibold text-brand-900";
const P = "mt-2 text-sm leading-relaxed text-foreground";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <Link href="/dashboard" className="text-sm text-brand-700 hover:underline">
          ← Back to Tally Insights
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-brand-900">
          Privacy policy
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tally Insights, by the team behind the Tally civic app. Last updated
          August 10, 2026. Questions: joshafidel@gmail.com
        </p>

        <h2 className={H}>What Tally Insights is</h2>
        <p className={P}>
          Tally Insights shows aggregated constituent sentiment to legislative
          and government affairs teams. The underlying responses come from
          people who chose to weigh in on topics and legislation in the Tally
          consumer app after verifying that they are real constituents.
        </p>

        <h2 className={H}>What we collect</h2>
        <p className={P}>
          Through the Tally consumer app, verified members may provide: their
          district (derived from identity verification), party registration,
          birth year, sex as it appears on their ID, and race or ethnicity if
          they choose to share it. Each rating a member submits records the
          item, the 1 to 5 value, the member&apos;s district, and a timestamp.
        </p>

        <h2 className={H}>What Tally Insights customers see</h2>
        <p className={P}>
          Aggregates only. No customer of Tally Insights can view an
          individual member&apos;s identity, responses, or profile. The
          database enforces this: customer accounts can only read views that
          group responses, and every demographic slice applies a minimum
          sample floor (50 responses for topline figures, 5 for demographic
          cells) so small groups cannot be singled out. Raw response tables
          are not readable by customer accounts at any tier.
        </p>

        <h2 className={H}>What we never do</h2>
        <p className={P}>
          We do not sell individual level data. We do not share voter files.
          We do not let customers export anything more granular than the
          aggregates shown on screen. We do not use your responses for
          advertising.
        </p>

        <h2 className={H}>Analytics</h2>
        <p className={P}>
          This site measures page usage with privacy respecting, cookieless
          analytics (aggregate page views and performance). We do not run
          third party advertising trackers.
        </p>

        <h2 className={H}>Demonstration data</h2>
        <p className={P}>
          The Tally Insights demo environment contains simulated responses
          generated for demonstration, labeled as such on the dashboard. Real
          legislation shown in the demo is public information; the opinions
          attached to it in the demo are synthetic and describe no real
          person.
        </p>

        <h2 className={H}>Your choices</h2>
        <p className={P}>
          Tally members can edit or remove demographic details, or delete
          their account, in the Tally consumer app; deletions propagate to
          the aggregates here. Customers with questions about data handling
          can write to the address above.
        </p>
      </div>
    </div>
  );
}
