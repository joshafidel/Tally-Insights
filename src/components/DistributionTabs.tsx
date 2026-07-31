"use client";

import { useState } from "react";

export type GroupDistribution = {
  key: string;
  label: string;
  color: string;
  n: number;
  avg: number | null;
  distribution: number[] | null;
};

export type DistributionTabsData = {
  all: { n: number; avg?: number | null; distribution: number[] | null };
  party: GroupDistribution[];
  age: GroupDistribution[];
  sex: GroupDistribution[];
  race: GroupDistribution[];
};

const RAMP = ["#c9b3e8", "#ad8ddb", "#8f66c9", "#6f44ae", "#4f2b8c"];
const LEVELS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];

/* The overall view mirrors the Tally app: one labeled bar per answer with
   its percentage on the right and a verified constituents line below. */
function TallyBars({
  n,
  distribution,
}: {
  n: number;
  distribution: number[] | null;
}) {
  const d = distribution ?? [0, 0, 0, 0, 0];
  const total = d.reduce((a, b) => a + b, 0);
  if (total === 0)
    return <p className="text-sm text-muted">No responses in this view yet.</p>;
  return (
    <div className="pt-1">
      <div className="space-y-2.5">
        {LEVELS.map((label, i) => {
          const pct = Math.round((d[i] / total) * 100);
          return (
            <div key={label} className="flex items-center gap-3">
              <div className="w-36 shrink-0 text-right text-sm font-medium text-brand-900">
                {label}
              </div>
              <div
                className="h-6 flex-1 overflow-hidden rounded-full bg-brand-50"
                title={`${label} · ${pct}% of all voters (${d[i].toLocaleString("en-US")} responses)`}
              >
                <div
                  className="flex h-full items-center justify-end rounded-full pr-2"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    backgroundColor: RAMP[i],
                    transition: "width 300ms ease",
                  }}
                >
                  {pct >= 12 && (
                    <span className="text-[11px] font-semibold text-white">
                      {pct}%
                    </span>
                  )}
                </div>
              </div>
              <div className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-brand-900">
                {pct}%
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t border-border pt-2 text-sm">
        <span className="font-semibold text-emerald-700">✓ {n.toLocaleString("en-US")} verified constituents</span>{" "}
        <span className="text-muted">weighed in on this question</span>
      </div>
    </div>
  );
}

function GroupRows({ groups }: { groups: GroupDistribution[] }) {
  if (groups.length === 0)
    return <p className="text-sm text-muted">No responses in this view yet.</p>;
  return (
    <div className="space-y-3 pt-2">
      {groups.map((g) => {
        const total = (g.distribution ?? []).reduce((a, b) => a + b, 0);
        return (
          <div key={g.key} className="flex items-center gap-3">
            <div className="flex w-36 shrink-0 items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: g.color }}
              />
              <span className="truncate text-sm">{g.label}</span>
            </div>
            <div className="flex h-6 flex-1 items-stretch gap-[2px]">
              {(g.distribution ?? [0, 0, 0, 0, 0]).map((count, i) => {
                const pct = total ? Math.round((count / total) * 100) : 0;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center overflow-hidden rounded-[3px]"
                    title={`${LEVELS[i]} · ${pct}% of ${g.label}`}
                    style={{
                      backgroundColor: RAMP[i],
                      width: `${total ? Math.max(pct, 1.5) : 20}%`,
                      opacity: total ? 1 : 0.15,
                    }}
                  >
                    {pct >= 10 && (
                      <span className="text-[10px] font-semibold text-white">
                        {pct}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="w-28 shrink-0 text-right text-sm tabular-nums">
              <span className="font-semibold text-brand-800">
                {g.avg != null ? g.avg.toFixed(2) : "n/a"}
              </span>{" "}
              <span className="text-xs text-muted">n={g.n.toLocaleString("en-US")}</span>
            </div>
          </div>
        );
      })}
      <div className="flex justify-between pt-1 text-xs text-muted">
        <span>
          each bar: strongly disagree (left) to strongly agree (right); hover a
          segment for its share
        </span>
      </div>
    </div>
  );
}

export function DistributionTabs({ data }: { data: DistributionTabsData }) {
  const TABS = [
    { key: "all", label: "All voters" },
    { key: "party", label: "By party" },
    { key: "age", label: "By age" },
    { key: "sex", label: "By sex" },
    { key: "race", label: "By race" },
  ] as const;
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");

  return (
    <div>
      <div className="mb-2 inline-flex items-center gap-1 rounded-lg border border-border bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-md px-3 py-1.5 text-xs text-muted hover:bg-brand-50"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Fixed height panel so switching tabs never resizes the card */}
      <div className="min-h-[248px]">
        {tab === "all" ? (
          <TallyBars n={data.all.n} distribution={data.all.distribution} />
        ) : (
          <GroupRows groups={data[tab]} />
        )}
      </div>
    </div>
  );
}
