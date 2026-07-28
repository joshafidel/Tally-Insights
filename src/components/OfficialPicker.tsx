"use client";

import { useMemo, useState } from "react";

export type OfficialVoteRow = {
  bill_id: string;
  bill_title: string;
  vote: string;
  sample_n: number;
  district_avg: number | null;
  gap: number | null;
  alignment: string;
};

export type OfficialSummary = {
  id: string;
  name: string;
  party: string;
  role: string;
  region: string;
  alignedPct: number | null;
  scoredCount: number;
  votes: OfficialVoteRow[];
};

const ALIGNMENT_LABEL: Record<string, string> = {
  aligned: "Aligned with district",
  against_district_support: "Voted against what the district supports",
  with_what_district_opposes: "Voted for what the district opposes",
  district_neutral: "District neutral",
  not_scored: "Not scored",
};

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-d)",
  R: "var(--party-r)",
  I: "var(--party-i)",
};

function PartyChip({ party }: { party: string }) {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: PARTY_COLOR[party] ?? "var(--brand-400)" }}
      title={party}
    >
      {party}
    </span>
  );
}

export function Scorecard({ official }: { official: OfficialSummary }) {
  const sorted = [...official.votes].sort(
    (a, b) => (b.gap ?? -1) - (a.gap ?? -1)
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <PartyChip party={official.party} />
          <div>
            <div className="text-lg font-semibold text-brand-900">
              {official.name}
            </div>
            <div className="text-sm text-muted">
              {official.role} · {official.region}
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-brand-50 px-4 py-2 text-right">
          {official.alignedPct != null ? (
            <>
              <div className="text-2xl font-semibold tabular-nums text-brand-800">
                {official.alignedPct}%
              </div>
              <div className="text-xs text-muted">
                aligned · {official.scoredCount} scored{" "}
                {official.scoredCount === 1 ? "vote" : "votes"}
              </div>
            </>
          ) : (
            <div className="max-w-44 text-xs text-muted">
              No votes scored yet: needs 5+ district responses on a voted bill
            </div>
          )}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Bill</th>
            <th className="py-2 pr-3 font-medium">Vote</th>
            <th className="py-2 pr-3 text-right font-medium">District mean</th>
            <th className="py-2 pr-3 text-right font-medium">Gap</th>
            <th className="py-2 font-medium">Call</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((v) => (
            <tr key={v.bill_id} className="border-b border-border last:border-0">
              <td className="max-w-[340px] py-2 pr-3">
                <div className="truncate" title={v.bill_title}>
                  {v.bill_title}
                </div>
              </td>
              <td className="py-2 pr-3 capitalize">{v.vote}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {v.district_avg != null ? (
                  <>
                    {v.district_avg.toFixed(2)}{" "}
                    <span className="text-xs text-muted">n={v.sample_n}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted">n={v.sample_n}</span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {v.gap != null ? v.gap.toFixed(2) : ""}
              </td>
              <td className="py-2">
                <span
                  className={
                    v.alignment === "aligned"
                      ? "rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-800"
                      : v.alignment === "not_scored"
                        ? "text-xs text-muted"
                        : "rounded bg-brand-800 px-1.5 py-0.5 text-xs font-medium text-white"
                  }
                >
                  {ALIGNMENT_LABEL[v.alignment] ?? v.alignment}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OfficialPicker({ officials }: { officials: OfficialSummary[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(officials[0]?.id ?? "");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return officials;
    return officials.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.role.toLowerCase().includes(q) ||
        o.region.toLowerCase().includes(q)
    );
  }, [officials, query]);

  const selected =
    officials.find((o) => o.id === selectedId) ?? matches[0] ?? officials[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            const q = e.target.value.trim().toLowerCase();
            if (q) {
              const hit = officials.find(
                (o) =>
                  o.name.toLowerCase().includes(q) ||
                  o.role.toLowerCase().includes(q) ||
                  o.region.toLowerCase().includes(q)
              );
              if (hit) setSelectedId(hit.id);
            }
          }}
          placeholder="Search any politician by name, position, or region..."
          className="w-80 rounded-lg border border-border bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
        <select
          value={selected?.id ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="min-w-72 rounded-lg border border-border bg-white px-3 py-2 text-sm shadow-sm"
        >
          {matches.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.role} · {o.region}
              {o.alignedPct != null ? ` · ${o.alignedPct}% aligned` : ""}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {matches.length} of {officials.length} officials
        </span>
      </div>
      {selected ? (
        <Scorecard official={selected} />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted">
          No officials match that search.
        </div>
      )}
    </div>
  );
}
