import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getDistrictOverview, logAccess } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { VolumeChart } from "@/components/charts/VolumeChart";
import { DistBar } from "@/components/DistBar";
import { createClient } from "@/lib/supabase/server";
import { deltaArrow, formatDelta } from "@/lib/format";

export default async function DashboardPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership || ctx.entitledDistricts.length === 0) redirect("/");
  const primary = ctx.entitledDistricts[0];
  const orgId = ctx.membership.orgId;
  const supabase = await createClient();

  const [overviews, { data: trendAll }, { data: rules }, { data: events }] =
    await Promise.all([
      Promise.all(
        ctx.entitledDistricts.map(async (d) => ({
          district: d,
          items: await getDistrictOverview(orgId, d.id),
        }))
      ),
      supabase
        .from("insights_daily_volume")
        .select("*")
        .order("day", { ascending: true }),
      supabase
        .from("item_alert_rules")
        .select("id, active")
        .eq("org_id", orgId),
      supabase
        .from("item_alert_events")
        .select("*")
        .eq("org_id", orgId)
        .order("fired_at", { ascending: false })
        .limit(5),
    ]);
  await logAccess(orgId, ctx.user.id, "view", "dashboard");

  // Daily response volume summed across all entitled districts.
  const volumeByDay = new Map<string, number>();
  for (const p of trendAll ?? []) {
    volumeByDay.set(p.day, (volumeByDay.get(p.day) ?? 0) + p.responses);
  }
  const volume = [...volumeByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, responses]) => ({ day, responses }));

  const allItems = overviews.flatMap((o) =>
    o.items.map((i) => ({ ...i, district: o.district }))
  );
  const withData = allItems.filter((i) => (i.stats?.n ?? 0) > 0);
  const totalResponses = withData.reduce((a, i) => a + (i.stats?.n ?? 0), 0);
  const tracked = allItems.filter((i) => i.tracked);
  const movers = withData
    .filter((i) => i.change7 != null || i.change30 != null)
    .sort(
      (a, b) =>
        Math.max(Math.abs(b.change7 ?? 0), Math.abs(b.change30 ?? 0)) -
        Math.max(Math.abs(a.change7 ?? 0), Math.abs(a.change30 ?? 0))
    )
    .slice(0, 4);
  const recentRated = withData.slice(0, 8);
  const unacked = (events ?? []).filter((e) => !e.acknowledged_at).length;

  return (
    <AppShell ctx={ctx} districtId={primary.id} active="Dashboard">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
          Good day, {ctx.membership.orgName}
        </h1>
        <p className="text-sm text-muted">
          Live constituent sentiment across your{" "}
          {ctx.entitledDistricts.length === 1
            ? "district"
            : `${ctx.entitledDistricts.length} districts`}
          : {ctx.entitledDistricts.map((d) => d.name).join(", ")}.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Verified responses", value: totalResponses },
          { label: "Items with sentiment", value: withData.length },
          { label: "Items tracked", value: tracked.length },
          {
            label: "Alerts (unacknowledged)",
            value: unacked,
            sub: `${(rules ?? []).filter((r) => r.active).length} active ${
              (rules ?? []).filter((r) => r.active).length === 1 ? "rule" : "rules"
            }`,
          },
        ].map((t) => (
          <div
            key={t.label}
            className="rounded-2xl border border-brand-200 bg-gradient-to-b from-card to-brand-50/70 px-5 py-4 shadow-sm"
          >
            <div className="text-3xl font-semibold tabular-nums text-brand-800">
              {t.value.toLocaleString("en-US")}
            </div>
            <div className="text-xs uppercase tracking-wide text-muted">
              {t.label}
            </div>
            {"sub" in t && t.sub && (
              <div className="mt-0.5 text-xs text-muted">{t.sub}</div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Constituent activity (responses per day)
            </h2>
            <span className="text-xs text-muted">
              all entitled districts, n={totalResponses.toLocaleString("en-US")} total
            </span>
          </div>
          {volume.length > 0 ? (
            <VolumeChart points={volume} />
          ) : (
            <p className="text-sm text-muted">No responses yet.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Latest alerts
          </h2>
          {(events ?? []).length === 0 ? (
            <p className="text-sm text-muted">
              No alerts fired yet. Rules run daily against live ratings;
              manage them on the{" "}
              <Link
                href={`/districts/${primary.id}/watchlist`}
                className="text-brand-700 hover:underline"
              >
                watchlist page
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id} className="rounded-lg bg-brand-50 px-3 py-2">
                  <span className="font-medium">{e.item_id}</span>{" "}
                  <span className="text-muted">
                    moved {e.delta} to {e.new_mean} (n={e.sample_n})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Biggest movers
          </h2>
          {movers.length === 0 ? (
            <p className="text-sm text-muted">
              Movement appears once items collect responses on more than one
              day.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {movers.map((m) => (
                <li key={`${m.kind}:${m.id}:${m.district.id}`} className="py-2">
                  <Link
                    href={`/districts/${m.district.id}/items/${m.kind}/${encodeURIComponent(m.id)}`}
                    className="flex items-center justify-between gap-3 hover:text-brand-800"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {m.title}
                    </span>
                    <span className="text-sm tabular-nums">
                      {formatDelta(m.change7 ?? m.change30)}{" "}
                      <span className="text-xs text-muted">
                        {deltaArrow(m.change7 ?? m.change30)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Live sentiment (most responses first)
          </h2>
          <ul className="divide-y divide-border">
            {recentRated.map((i) => (
              <li key={`${i.kind}:${i.id}:${i.district.id}`} className="py-2">
                <Link
                  href={`/districts/${i.district.id}/items/${i.kind}/${encodeURIComponent(i.id)}`}
                  className="flex items-center gap-3 hover:text-brand-800"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {i.title}
                  </span>
                  <DistBar distribution={i.stats?.distribution ?? null} className="w-24" />
                  <span className="w-12 text-right text-sm font-semibold tabular-nums text-brand-800">
                    {i.stats?.avg_value?.toFixed(2)}
                  </span>
                  <span className="w-10 text-right text-xs text-muted">
                    n={i.stats?.n}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
