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
            <div className="flex h-5 flex-1 items-stretch gap-[2px]">
              {(g.distribution ?? [0, 0, 0, 0, 0]).map((count, i) => (
                <div
                  key={i}
                  className="rounded-[3px]"
                  title={`${i + 1}: ${count} (${total ? Math.round((count / total) * 100) : 0}%)`}
                  style={{
                    backgroundColor: RAMP[i],
                    width: `${total ? Math.max((count / total) * 100, 1.5) : 20}%`,
                    opacity: total ? 1 : 0.15,
                  }}
                />
              ))}
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
        <span>each bar: share of that group answering 1 (left) to 5 (right)</span>
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
      {/* Every tab renders the same stacked bar rows, inside a fixed height
          panel so switching filters never resizes the card */}
      <div className="min-h-[248px]">
        {tab === "all" ? (
          <GroupRows
            groups={[
              {
                key: "all",
                label: "All voters",
                color: "var(--brand-600)",
                n: data.all.n,
                avg: data.all.avg ?? null,
                distribution: data.all.distribution,
              },
            ]}
          />
        ) : (
          <GroupRows groups={data[tab]} />
        )}
      </div>
    </div>
  );
}
