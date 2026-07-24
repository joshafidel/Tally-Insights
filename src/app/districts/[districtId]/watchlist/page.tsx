import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { getCatalog, logAccess } from "@/lib/insights";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import {
  acknowledgeAlert,
  addTrackedItem,
  createAlertRule,
  deleteAlertRule,
  removeTrackedItem,
  toggleAlertRule,
} from "./actions";

export default async function WatchlistPage({
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

  const canEdit = ctx.membership.role !== "viewer";
  const orgId = ctx.membership.orgId;
  const supabase = await createClient();

  const [catalog, { data: ratedTitles }, { data: tracked }, { data: rules }, { data: events }] =
    await Promise.all([
      getCatalog(),
      supabase
        .from("insights_item_sentiment")
        .select("kind, item_id, title")
        .eq("district_id", districtId),
      supabase
        .from("tracked_items")
        .select("*")
        .eq("org_id", orgId)
        .eq("district_id", districtId)
        .order("created_at", { ascending: false }),
      supabase
        .from("item_alert_rules")
        .select("*")
        .eq("org_id", orgId)
        .eq("district_id", districtId)
        .order("created_at", { ascending: false }),
      supabase
        .from("item_alert_events")
        .select("*")
        .eq("org_id", orgId)
        .order("fired_at", { ascending: false })
        .limit(50),
    ]);

  await logAccess(orgId, ctx.user.id, "view", "watchlist", {
    district_id: districtId,
  });

  const titleOf = (kind: string, itemId: string) =>
    catalog.find((c) => c.kind === kind && c.id === itemId)?.title ??
    (ratedTitles ?? []).find((r) => r.kind === kind && r.item_id === itemId)
      ?.title ??
    itemId;

  const trackedKeys = new Set(
    (tracked ?? []).map((t) => `${t.kind}:${t.item_id}`)
  );
  const addable = catalog.filter((c) => !trackedKeys.has(`${c.kind}:${c.id}`));

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Watchlist and alerts">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-900">
          {district.name}: watchlist and alerts
        </h1>
        <p className="text-sm text-muted">
          Track items to pin them on the overview, and set movement thresholds
          to get alerted when district sentiment shifts. Alerts are evaluated
          daily against live Tally ratings.
          {!canEdit && " Your viewer seat is read only."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Tracked items ({tracked?.length ?? 0})
          </h2>
          {canEdit && (
            <form action={addTrackedItem} className="mb-4 flex gap-2">
              <input type="hidden" name="org_id" value={orgId} />
              <input type="hidden" name="district_id" value={districtId} />
              <select
                name="item"
                required
                className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Choose an item to track...
                </option>
                <optgroup label="Topics">
                  {addable
                    .filter((c) => c.kind === "topic")
                    .map((c) => (
                      <option key={c.id} value={`topic:${c.id}`}>
                        {c.title}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="City and curated bills">
                  {addable
                    .filter((c) => c.kind === "bill")
                    .map((c) => (
                      <option key={c.id} value={`bill:${c.id}`}>
                        {c.title}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Federal bills">
                  {addable
                    .filter((c) => c.kind === "live_bill")
                    .map((c) => (
                      <option key={c.id} value={`live_bill:${c.id}`}>
                        {c.title.length > 90 ? c.title.slice(0, 90) + "..." : c.title}
                      </option>
                    ))}
                </optgroup>
              </select>
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Track
              </button>
            </form>
          )}
          <ul className="divide-y divide-border">
            {(tracked ?? []).map((t) => (
              <li key={`${t.kind}:${t.item_id}`} className="flex items-center gap-3 py-2">
                <Link
                  href={`/districts/${districtId}/items/${t.kind}/${encodeURIComponent(t.item_id)}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-brand-800 hover:underline"
                >
                  {titleOf(t.kind, t.item_id)}
                </Link>
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  {t.kind.replace("_", " ")}
                </span>
                {canEdit && (
                  <form action={removeTrackedItem}>
                    <input type="hidden" name="org_id" value={orgId} />
                    <input type="hidden" name="district_id" value={districtId} />
                    <input type="hidden" name="kind" value={t.kind} />
                    <input type="hidden" name="item_id" value={t.item_id} />
                    <button
                      type="submit"
                      className="text-xs text-muted hover:text-brand-800 hover:underline"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
            {(tracked ?? []).length === 0 && (
              <li className="py-2 text-sm text-muted">Nothing tracked yet.</li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Alert rules ({rules?.length ?? 0})
          </h2>
          {canEdit && (
            <form action={createAlertRule} className="mb-4 flex flex-wrap items-center gap-2">
              <input type="hidden" name="org_id" value={orgId} />
              <input type="hidden" name="district_id" value={districtId} />
              <select
                name="item"
                required
                defaultValue=""
                className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  Alert me about...
                </option>
                {(tracked ?? []).map((t) => (
                  <option key={`${t.kind}:${t.item_id}`} value={`${t.kind}:${t.item_id}`}>
                    {titleOf(t.kind, t.item_id)}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-sm text-muted">
                moves by
                <input
                  type="number"
                  name="threshold"
                  min="0.05"
                  max="4"
                  step="0.05"
                  defaultValue="0.25"
                  className="w-20 rounded-md border border-border bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <select
                name="window_days"
                defaultValue="7"
                className="rounded-md border border-border bg-white px-2 py-1.5 text-sm"
              >
                <option value="7">in 7 days</option>
                <option value="30">in 30 days</option>
              </select>
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Add rule
              </button>
            </form>
          )}
          <ul className="divide-y divide-border">
            {(rules ?? []).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{titleOf(r.kind, r.item_id)}</span>{" "}
                  <span className="text-muted">
                    moves ±{Number(r.threshold).toFixed(2)} in {r.window_days}d
                  </span>
                </span>
                <span
                  className={
                    r.active
                      ? "rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-800"
                      : "rounded bg-brand-50 px-1.5 py-0.5 text-xs text-muted"
                  }
                >
                  {r.active ? "active" : "paused"}
                </span>
                {canEdit && (
                  <>
                    <form action={toggleAlertRule}>
                      <input type="hidden" name="rule_id" value={r.id} />
                      <input type="hidden" name="district_id" value={districtId} />
                      <input type="hidden" name="active" value={String(!r.active)} />
                      <button className="text-xs text-muted hover:text-brand-800 hover:underline">
                        {r.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={deleteAlertRule}>
                      <input type="hidden" name="rule_id" value={r.id} />
                      <input type="hidden" name="district_id" value={districtId} />
                      <button className="text-xs text-muted hover:text-brand-800 hover:underline">
                        Delete
                      </button>
                    </form>
                  </>
                )}
              </li>
            ))}
            {(rules ?? []).length === 0 && (
              <li className="py-2 text-sm text-muted">No alert rules yet.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Alert log
        </h2>
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-muted">
            No alerts have fired yet. Rules are checked once a day; in app
            delivery now, email delivery can be attached later.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Fired</th>
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 text-right font-medium">From</th>
                <th className="py-2 pr-3 text-right font-medium">To</th>
                <th className="py-2 pr-3 text-right font-medium">Delta</th>
                <th className="py-2 pr-3 text-right font-medium">Sample</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {new Date(e.fired_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="max-w-[280px] truncate py-2 pr-3">
                    {titleOf(e.kind, e.item_id)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{e.old_mean}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{e.new_mean}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{e.delta}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">n={e.sample_n}</td>
                  <td className="py-2">
                    {e.acknowledged_at ? (
                      <span className="text-xs text-muted">acknowledged</span>
                    ) : (
                      <form action={acknowledgeAlert}>
                        <input type="hidden" name="event_id" value={e.id} />
                        <input type="hidden" name="district_id" value={districtId} />
                        <button className="rounded bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700">
                          Acknowledge
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
