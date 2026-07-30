"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DistBar } from "@/components/DistBar";

export type TopicRow = {
  id: string;
  kind: string;
  status: string | null;
  title: string;
  category: string | null;
  createdAt: string | null;
  mean: number | null;
  distribution: number[] | null;
  n: number;
  change7: number | null;
  change30: number | null;
  tracked: boolean;
};

type SortKey = "title" | "category" | "added" | "mean" | "n" | "c7" | "c30";

const DATE_PRESETS = [
  { key: "any", label: "Any time", days: null },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last year", days: 365 },
];

function fmtDelta(v: number | null) {
  if (v == null) return "n/a";
  const arrow = Math.abs(v) < 0.005 ? "" : v > 0 ? " ▲" : " ▼";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}${arrow}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TopicsTable({
  rows,
  districtId,
  showAdded = true,
  showStatus = false,
  itemLabel = "Topic",
}: {
  rows: TopicRow[];
  districtId: string;
  showAdded?: boolean;
  showStatus?: boolean;
  itemLabel?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("n");
  const [sortDesc, setSortDesc] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [datePreset, setDatePreset] = useState("any");

  const allCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const c = r.category ?? "other";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (categories.size > 0)
      out = out.filter((r) => categories.has(r.category ?? "other"));
    const preset = DATE_PRESETS.find((p) => p.key === datePreset);
    if (preset?.days != null) {
      const cutoff = Date.now() - preset.days * 86400_000;
      out = out.filter(
        (r) => r.createdAt && new Date(r.createdAt).getTime() >= cutoff
      );
    }
    const dir = sortDesc ? -1 : 1;
    const val = (r: TopicRow): string | number => {
      switch (sortKey) {
        case "title": return r.title.toLowerCase();
        case "category": return r.category ?? "";
        case "added": return r.createdAt ?? "";
        case "mean": return r.mean ?? -1;
        case "n": return r.n;
        case "c7": return r.change7 ?? -99;
        case "c30": return r.change30 ?? -99;
      }
    };
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, categories, datePreset, sortKey, sortDesc]);

  const sortBy = (key: SortKey, defaultDesc = true) => {
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(defaultDesc);
    }
  };
  const indicator = (key: SortKey) =>
    sortKey === key ? (sortDesc ? " ▼" : " ▲") : "";

  const th = "px-4 py-2.5 font-medium text-left text-xs uppercase tracking-wide text-muted select-none";
  const btn = "hover:text-brand-800 cursor-pointer";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {openMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
      )}
      <table className="w-full text-sm">
        <thead className="bg-brand-50">
          <tr>
            <th className={th}>
              <button type="button" className={btn} onClick={() => sortBy("title", false)}>
                {itemLabel}{indicator("title")}
              </button>
            </th>
            <th className={`${th} relative`}>
              <button
                type="button"
                className={`${btn} rounded border px-1.5 py-0.5 ${categories.size > 0 ? "border-brand-500 bg-brand-100 text-brand-800" : "border-transparent"}`}
                onClick={() => setOpenMenu(openMenu === "category" ? null : "category")}
              >
                Category{categories.size > 0 ? ` (${categories.size})` : ""} ▾
              </button>
              {openMenu === "category" && (
                <div className="absolute left-2 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    className="mb-1 w-full rounded px-2 py-1 text-left text-xs normal-case text-brand-700 hover:bg-brand-50"
                    onClick={() => setCategories(new Set())}
                  >
                    Clear filter (show all)
                  </button>
                  {allCategories.map(([c, count]) => (
                    <label
                      key={c}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm normal-case tracking-normal text-foreground hover:bg-brand-50"
                    >
                      <input
                        type="checkbox"
                        checked={categories.has(c)}
                        onChange={(e) => {
                          const next = new Set(categories);
                          if (e.target.checked) next.add(c);
                          else next.delete(c);
                          setCategories(next);
                        }}
                      />
                      <span className="flex-1">{c}</span>
                      <span className="text-xs text-muted">{count}</span>
                    </label>
                  ))}
                </div>
              )}
            </th>
            {showStatus && <th className={th}>Status</th>}
            {showAdded && <th className={`${th} relative`}>
              <button
                type="button"
                className={`${btn} rounded border px-1.5 py-0.5 ${datePreset !== "any" ? "border-brand-500 bg-brand-100 text-brand-800" : "border-transparent"}`}
                onClick={() => setOpenMenu(openMenu === "added" ? null : "added")}
              >
                Added{datePreset !== "any" ? ` (${DATE_PRESETS.find((p) => p.key === datePreset)?.label})` : ""} ▾
              </button>
              {openMenu === "added" && (
                <div className="absolute left-2 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-white p-2 shadow-lg">
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`block w-full rounded px-2 py-1 text-left text-sm normal-case tracking-normal hover:bg-brand-50 ${datePreset === p.key ? "bg-brand-100 font-medium text-brand-800" : "text-foreground"}`}
                      onClick={() => {
                        setDatePreset(p.key);
                        setOpenMenu(null);
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  <div className="mt-1 border-t border-border pt-1">
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left text-xs normal-case text-brand-700 hover:bg-brand-50"
                      onClick={() => sortBy("added")}
                    >
                      Sort by date{indicator("added")}
                    </button>
                  </div>
                </div>
              )}
            </th>}
            <th className={`${th} text-right`}>
              <button type="button" className={btn} onClick={() => sortBy("mean")}>
                Mean{indicator("mean")}
              </button>
            </th>
            <th className={th}>Distribution (1 to 5)</th>
            <th className={`${th} text-right`}>
              <button type="button" className={btn} onClick={() => sortBy("n")}>
                Responses{indicator("n")}
              </button>
            </th>
            <th className={`${th} text-right`}>
              <button type="button" className={btn} onClick={() => sortBy("c7")}>
                7D{indicator("c7")}
              </button>
            </th>
            <th className={`${th} text-right`}>
              <button type="button" className={btn} onClick={() => sortBy("c30")}>
                30D{indicator("c30")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-brand-50/50">
              <td className="max-w-[420px] px-4 py-2.5">
                <Link
                  href={`/districts/${districtId}/items/${r.kind}/${encodeURIComponent(r.id)}`}
                  className="font-medium text-brand-800 hover:underline"
                >
                  {r.title}
                </Link>
                {r.tracked && (
                  <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700">
                    tracked
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-muted">{r.category ?? "Other"}</td>
              {showStatus && <td className="px-4 py-2.5 capitalize text-muted">{(r.status ?? "").replaceAll("_", " ")}</td>}
              {showAdded && <td className="whitespace-nowrap px-4 py-2.5 text-muted">{fmtDate(r.createdAt)}</td>}
              <td className="px-4 py-2.5 text-right">
                {r.mean != null ? (
                  <span className="text-base font-semibold tabular-nums text-brand-800">
                    {r.mean.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-xs text-muted">no responses yet</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <DistBar distribution={r.distribution} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.n.toLocaleString("en-US")}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtDelta(r.change7)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtDelta(r.change30)}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-sm text-muted">
                No topics match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
