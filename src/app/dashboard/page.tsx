import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import {
  getAlignment,
  getDistrictOverview,
  logAccess,
  type OverviewItem,
} from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { DistBar } from "@/components/DistBar";
import { createClient } from "@/lib/supabase/server";
import { DOWN_COLOR, UP_COLOR } from "@/lib/format";

/* Support share: answers of 4 or 5 as a percentage of responses */
function shares(item: OverviewItem) {
  const d = item.stats?.distribution;
  const n = item.stats?.n ?? 0;
  if (!d || n === 0) return null;
  const support = Math.round(((d[3] + d[4]) / n) * 100);
  const oppose = Math.round(((d[0] + d[1]) / n) * 100);
  return { support, oppose, neutral: Math.max(0, 100 - support - oppose), n };
}

/* Mean shift on the 1 to 5 scale expressed as approximate support points */
function pts(delta: number | null): number | null {
  return delta == null ? null : Math.round(delta * 25 * 10) / 10;
}

export default async function DashboardPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership || ctx.entitledDistricts.length === 0) redirect("/");
  // The dashboard is the rundown for the org's own district: a New York
  // senate office configured with 'ny' sees statewide sentiment here.
  const primary =
    ctx.entitledDistricts.find((d) => d.id === ctx.membership!.primaryDistrictId) ??
    ctx.entitledDistricts.find((d) => d.id === "nyc") ??
    ctx.entitledDistricts[0];
  const orgId = ctx.membership.orgId;
  const meta = ctx.user.user_metadata as Record<string, unknown> | undefined;
  const firstName =
    typeof meta?.full_name === "string" && meta.full_name.trim()
      ? meta.full_name.trim().split(/\s+/)[0]
      : null;
  const supabase = await createClient();

  const [items, alignmentRows, { data: engagement }, { data: events }, { data: firstDay }, { data: lastDay }, { data: trackedFed }] =
    await Promise.all([
      getDistrictOverview(orgId, primary.id),
      getAlignment([primary.id, "us"]),
      supabase.from("insights_party_engagement").select("*"),
      supabase
        .from("item_alert_events")
        .select("*")
        .eq("org_id", orgId)
        .order("fired_at", { ascending: false })
        .limit(4),
      supabase.from("insights_daily_volume").select("day").order("day", { ascending: true }).limit(1),
      supabase.from("insights_daily_volume").select("day").order("day", { ascending: false }).limit(1),
      supabase
        .from("tracked_items")
        .select("item_id")
        .eq("org_id", orgId)
        .eq("kind", "live_bill"),
    ]);
  await logAccess(orgId, ctx.user.id, "view", "dashboard");

  const withData = items.filter((i) => (i.stats?.n ?? 0) > 0);

  // Card 1: top district priority (most responded topic)
  const topTopic = withData.filter((i) => i.kind === "topic")[0] ?? null;
  const topShares = topTopic ? shares(topTopic) : null;

  // Card 2: largest opinion shift
  const movers = withData
    .map((i) => ({ item: i, delta: i.change7 ?? i.change30, window: i.change7 != null ? 7 : 30 }))
    .filter((m) => m.delta != null && Math.abs(m.delta) >= 0.02)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));
  const shift = movers[0] ?? null;

  // Card 3: largest representation gap
  const gaps = alignmentRows
    .filter((r) => ["against_district_support", "with_what_district_opposes"].includes(r.alignment))
    .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
  const gap = gaps[0] ?? null;

  // Card 4: most recent action on a tracked federal bill
  let nextAction: { title: string; action: string; date: string | null } | null = null;
  const fedIds = (trackedFed ?? []).map((t) => t.item_id);
  if (fedIds.length > 0) {
    const { data: lb } = await supabase
      .from("live_bills")
      .select("title, latest_action, latest_action_date")
      .in("id", fedIds)
      .order("latest_action_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lb) nextAction = { title: lb.title, action: lb.latest_action ?? "", date: lb.latest_action_date };
  }

  // Monthly active respondent mix (share of active respondents, not of all constituents)
  const eng = (engagement ?? []) as { party: string; constituents: number; engaged_this_month: number }[];
  const activeTotal = eng.reduce((a, r) => a + r.engaged_this_month, 0);
  const mix = ["D", "R", "I"].map((p) => ({
    party: p,
    label: p === "D" ? "Democrats" : p === "R" ? "Republicans" : "Independents",
    color: p === "D" ? "var(--party-d)" : p === "R" ? "var(--party-r)" : "var(--party-i)",
    pct: activeTotal ? Math.round(((eng.find((e) => e.party === p)?.engaged_this_month ?? 0) / activeTotal) * 100) : 0,
  }));
  const verified = eng.reduce((a, r) => a + r.constituents, 0);

  const days = [firstDay?.[0]?.day, lastDay?.[0]?.day].filter(Boolean) as string[];
  const fmtD = (d?: string) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const simulated = process.env.NEXT_PUBLIC_SIMULATED_DATA === "1";

  const gapDirection = (a: string) =>
    a === "against_district_support"
      ? "District supports, office opposed"
      : "District opposes, office supported";

  return (
    <AppShell ctx={ctx} districtId={primary.id} active="Dashboard">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
          Good day, {firstName ?? ctx.membership.orgName}
        </h1>
        <p className="text-sm text-muted">
          The rundown for {primary.name}, your district, with national
          comparison coverage.
        </p>
      </div>

      {/* What a legislative office needs first */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-brand-200 bg-card p-5 shadow-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Top district priority
          </div>
          {topTopic && topShares ? (
            <>
              <Link
                href={`/districts/${primary.id}/items/topic/${topTopic.id}`}
                className="line-clamp-2 text-sm font-semibold text-brand-900 hover:underline"
              >
                {topTopic.title}
              </Link>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-brand-800">
                {topShares.support}%{" "}
                <span className="text-sm font-normal text-muted">support</span>
              </div>
              <div
                className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-brand-100"
                title={`${topShares.support}% support · ${topShares.neutral}% neutral · ${topShares.oppose}% oppose`}
              >
                <div style={{ width: `${topShares.support}%`, backgroundColor: "var(--brand-700)" }} />
                <div style={{ width: `${topShares.neutral}%`, backgroundColor: "var(--brand-300)" }} />
                <div style={{ width: `${topShares.oppose}%`, backgroundColor: "#d9d4e3" }} />
              </div>
              <div className="mt-1 text-xs text-muted">
                most responded topic · {topShares.n.toLocaleString("en-US")} verified responses
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Appears once constituents respond.</p>
          )}
        </div>

        <div className="rounded-2xl border border-brand-200 bg-card p-5 shadow-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Largest opinion shift
          </div>
          {shift ? (
            <>
              <Link
                href={`/districts/${primary.id}/items/${shift.item.kind}/${encodeURIComponent(shift.item.id)}`}
                className="line-clamp-2 text-sm font-semibold text-brand-900 hover:underline"
              >
                {shift.item.title}
              </Link>
              <div
                className="mt-1 text-2xl font-semibold tabular-nums"
                style={{ color: shift.delta! > 0 ? UP_COLOR : DOWN_COLOR }}
              >
                {shift.delta! > 0 ? "▲" : "▼"} {Math.abs(pts(shift.delta)!)} pts
              </div>
              <div className="text-xs text-muted">
                <span style={{ color: shift.delta! > 0 ? UP_COLOR : DOWN_COLOR }}>
                  support {shift.delta! > 0 ? "up" : "down"}
                </span>{" "}
                over {shift.window} days · {primary.name} ·{" "}
                {(shift.item.stats?.n ?? 0).toLocaleString("en-US")} responses
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No meaningful movement this week.</p>
          )}
        </div>

        <div className="rounded-2xl border border-brand-200 bg-card p-5 shadow-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Largest representation gap
          </div>
          {gap ? (
            <>
              <div className="line-clamp-2 text-sm font-semibold text-brand-900">
                {gap.bill_title}
              </div>
              <div className="mt-1 text-sm font-semibold text-brand-800">
                {gapDirection(gap.alignment)}
              </div>
              <div className="text-xs text-muted">
                {gap.official_name} voted {gap.vote} · district mean{" "}
                {gap.district_avg?.toFixed(2)} · n={gap.sample_n.toLocaleString("en-US")}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              No scored votes conflict with district sentiment right now.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-brand-200 bg-card p-5 shadow-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Latest action on a tracked bill
          </div>
          {nextAction ? (
            <>
              <div className="line-clamp-2 text-sm font-semibold text-brand-900">
                {nextAction.title}
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-brand-800">
                {nextAction.action}
              </div>
              <div className="text-xs text-muted">{fmtD(nextAction.date ?? undefined)}</div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Track federal bills to follow their floor and committee actions here.
            </p>
          )}
        </div>
      </div>

      {/* Respondent mix: shares of active respondents, an honest denominator */}
      <div className="mb-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Monthly active respondent mix
            </div>
            <div className="mt-1 flex items-baseline gap-5">
              {mix.map((m) => (
                <span key={m.party} className="text-lg font-semibold tabular-nums" style={{ color: m.color }}>
                  {m.label} {m.pct}%
                </span>
              ))}
            </div>
            <div
              className="mt-2 flex h-2.5 w-full min-w-72 overflow-hidden rounded-full bg-brand-100"
              title="Share of this month's active respondents by party; the gray remainder did not state a party"
            >
              {mix.map((m) => (
                <div key={m.party} style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
              ))}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-lg font-semibold tabular-nums text-brand-800">
              {verified.toLocaleString("en-US")}
            </div>
            <div className="text-xs text-muted">
              verified constituents · {activeTotal.toLocaleString("en-US")} responded this month
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Biggest movers ({primary.name})
          </h2>
          {movers.length === 0 ? (
            <p className="text-sm text-muted">No items moved meaningfully this week.</p>
          ) : (
            <ul className="divide-y divide-border">
              {movers.slice(0, 5).map(({ item, delta, window: w }) => {
                const maxAbs = Math.max(...movers.slice(0, 5).map((m) => Math.abs(pts(m.delta)!)));
                const p = pts(delta)!;
                const half = Math.max((Math.abs(p) / Math.max(maxAbs, 0.1)) * 50, 2);
                const color = p > 0 ? UP_COLOR : DOWN_COLOR;
                return (
                  <li key={`${item.kind}:${item.id}`} className="py-2.5">
                    <Link
                      href={`/districts/${primary.id}/items/${item.kind}/${encodeURIComponent(item.id)}`}
                      className="block hover:text-brand-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-1 text-sm font-medium">{item.title}</div>
                          <div className="text-xs text-muted">
                            <span className="font-semibold" style={{ color }}>
                              {p > 0 ? "▲" : "▼"} support {p > 0 ? "up" : "down"}{" "}
                              {Math.abs(p)} pts
                            </span>{" "}
                            over {w} days ·{" "}
                            {(item.stats?.n ?? 0).toLocaleString("en-US")} verified responses
                          </div>
                        </div>
                        <div
                          className="relative h-2.5 w-32 shrink-0 overflow-hidden rounded bg-brand-50"
                          title={`${p > 0 ? "+" : ""}${p} points`}
                        >
                          <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                          <div
                            className="absolute inset-y-0 rounded-sm"
                            style={
                              p > 0
                                ? { left: "50%", width: `${half}%`, backgroundColor: color }
                                : { right: "50%", width: `${half}%`, backgroundColor: color }
                            }
                          />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Where the district stands (most responses first)
          </h2>
          <ul className="divide-y divide-border">
            {withData.slice(0, 7).map((i) => {
              const s = shares(i)!;
              return (
                <li key={`${i.kind}:${i.id}`} className="py-2.5">
                  <Link
                    href={`/districts/${primary.id}/items/${i.kind}/${encodeURIComponent(i.id)}`}
                    className="flex items-center gap-3 hover:text-brand-800"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.title}</span>
                    <DistBar distribution={i.stats?.distribution ?? null} className="w-20" />
                    <span className="w-56 shrink-0 text-right text-xs tabular-nums">
                      <span className="font-semibold text-brand-800">{s.support}% support</span>
                      <span className="text-muted"> · {s.oppose}% oppose · n={s.n.toLocaleString("en-US")}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Alerts
        </h2>
        {(events ?? []).length > 0 ? (
          <ul className="space-y-2 text-sm">
            {(events ?? []).map((e) => (
              <li key={e.id} className="rounded-lg bg-brand-50 px-3 py-2">
                <span
                  className="font-semibold"
                  style={{ color: Number(e.delta) > 0 ? UP_COLOR : DOWN_COLOR }}
                >
                  {Number(e.delta) > 0 ? "▲" : "▼"} {Math.abs(Math.round(Number(e.delta) * 25 * 10) / 10)} pts
                </span>{" "}
                <span className="font-medium">{e.item_id}</span>{" "}
                <span className="text-muted">
                  · mean {e.old_mean} to {e.new_mean} · n={Number(e.sample_n).toLocaleString("en-US")} ·{" "}
                  {fmtD(String(e.fired_at).slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p className="mb-2 text-sm text-muted">
              No alerts have fired yet. Rules run daily against live ratings.
              Recommended rules to start with:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Notify me when support for a tracked item changes by more than 5 points</li>
              <li>Notify me when an item passes 500 district responses</li>
              <li>Notify me when district sentiment conflicts with an official&apos;s vote</li>
            </ul>
            <Link
              href={`/districts/${primary.id}/watchlist`}
              className="mt-2 inline-block text-sm text-brand-700 hover:underline"
            >
              Set up alert rules →
            </Link>
          </div>
        )}
      </section>

      {/* Data quality: the front page carries its own methodology summary */}
      <section className="mt-4 rounded-2xl border border-border bg-brand-50/60 px-5 py-3 text-xs text-muted">
        <span className="font-semibold text-brand-800">About this data:</span>{" "}
        {days.length > 0 ? `responses from ${fmtD(days[0])} to ${fmtD(days[days.length - 1])}` : "no responses yet"}
        {" · updated continuously · coverage: New York City at council district level, all 50 states, national"}
        {" · unweighted means of ID verified constituents · top line floor n=50, demographic floor n=5"}
        {" · self selected respondents, not a probability sample"}
        {simulated ? " · SIMULATED DATASET for demonstration" : ""}{" "}
        <Link href={`/methodology?district=${primary.id}`} className="text-brand-700 hover:underline">
          Full methodology →
        </Link>
      </section>
    </AppShell>
  );
}
