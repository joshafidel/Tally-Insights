import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";

export default async function Home() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  if (!ctx.membership || ctx.entitledDistricts.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
        <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mb-2 text-xl font-semibold text-brand-800">
            No workspace access
          </div>
          <p className="mb-6 text-sm text-muted">
            Your account ({ctx.user.email}) is signed in, but it is not a
            member of a Tally Insights organization with district access.
            Contact your organization admin, or reach the Tally team to set up
            a subscription.
          </p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-brand-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  redirect(`/districts/${ctx.entitledDistricts[0].id}`);
}
