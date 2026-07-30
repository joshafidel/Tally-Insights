"use client";

import { useMemo, useState } from "react";
import { GeoMap } from "@/components/GeoMap";
import {
  Scorecard,
  type OfficialSummary,
} from "@/components/OfficialPicker";

export type DirectoryEntry = {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  level: "senate" | "house" | "state_local";
  votesRecorded: number;
  lastVoteDate: string | null;
  alignedPct: number | null;
  curated: OfficialSummary | null;
  recentVotes: {
    vote_date: string | null;
    bill_title: string | null;
    question: string | null;
    vote_cast: string | null;
  }[];
};

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-d)",
  R: "var(--party-r)",
  I: "var(--party-i)",
  ID: "var(--party-i)",
};

const LEVEL_TABS = [
  { key: "all", label: "All" },
  { key: "senate", label: "Senate (100)" },
  { key: "house", label: "House (435)" },
  { key: "state_local", label: "State and local" },
];

const SORTS = [
  { key: "name", label: "Name" },
  { key: "state", label: "State" },
  { key: "party", label: "Party" },
  { key: "votes", label: "Votes recorded" },
  { key: "alignment", label: "Alignment" },
];

function PartyDot({ party }: { party: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: PARTY_COLOR[party] ?? "var(--brand-400)" }}
    >
      {party}
    </span>
  );
}

export function OfficialsDirectory({ entries }: { entries: DirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [party, setParty] = useState("all");
  const [state, setState] = useState<string | null>(null);
  const [sort, setSort] = useState("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = entries;
    if (level !== "all") rows = rows.filter((e) => e.level === level);
    if (party !== "all") rows = rows.filter((e) => e.party === party);
    if (state) rows = rows.filter((e) => e.state === state);
    if (q)
      rows = rows.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.office.toLowerCase().includes(q) ||
          e.state.toLowerCase().includes(q)
      );
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "state":
          return a.state.localeCompare(b.state) || a.name.localeCompare(b.name);
        case "party":
          return a.party.localeCompare(b.party) || a.name.localeCompare(b.name);
        case "votes":
          return b.votesRecorded - a.votesRecorded;
        case "alignment":
          return (b.alignedPct ?? -1) - (a.alignedPct ?? -1);
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [entries, query, level, party, state, sort]);

  const mapCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let rows = entries;
    if (level !== "all") rows = rows.filter((e) => e.level === level);
    if (party !== "all") rows = rows.filter((e) => e.party === party);
    for (const e of rows) counts[e.state] = (counts[e.state] ?? 0) + 1;
    return counts;
  }, [entries, level, party]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[460px_1fr]">
      <div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Find officials on the map
          </h2>
          <GeoMap counts={mapCounts} selectedState={state} onSelectState={setState} height={300} />
        </div>
        {selected && (
          <div className="mt-6">
            {selected.curated ? (
              <Scorecard official={selected.curated} />
            ) : (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <PartyDot party={selected.party} />
                  <div>
                    <div className="text-base font-semibold text-brand-900">
                      {selected.name}
                    </div>
                    <div className="text-sm text-muted">
                      {selected.office} · {selected.state}
                    </div>
                  </div>
                </div>
                <div className="mb-3 text-xs text-muted">
                  {selected.votesRecorded} roll call votes recorded
                  {selected.lastVoteDate ? `, latest ${selected.lastVoteDate}` : ""}.
                  Alignment scoring activates when rated bills map to their
                  votes.
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1.5 pr-2 font-medium">Date</th>
                      <th className="py-1.5 pr-2 font-medium">Vote</th>
                      <th className="py-1.5 font-medium">Cast</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.recentVotes.map((v, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap py-1.5 pr-2 text-xs">
                          {v.vote_date}
                        </td>
                        <td className="max-w-[240px] truncate py-1.5 pr-2" title={v.bill_title ?? v.question ?? ""}>
                          {v.bill_title || v.question}
                        </td>
                        <td className="py-1.5 text-xs">{v.vote_cast}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all officials by name, office, or state..."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 sm:w-72"
          />
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white p-1">
            {LEVEL_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setLevel(t.key)}
                className={
                  level === t.key
                    ? "rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white"
                    : "rounded-md px-2.5 py-1 text-xs text-muted hover:bg-brand-50"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-border bg-white">
            {[
              { key: "all", label: "All parties", color: "var(--brand-600)" },
              { key: "D", label: "Dem", color: "var(--party-d)" },
              { key: "R", label: "Rep", color: "var(--party-r)" },
              { key: "I", label: "Ind", color: "var(--party-i)" },
            ].map((o, i) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setParty(o.key)}
                className={
                  (i > 0 ? "border-l border-border " : "") +
                  (party === o.key
                    ? "px-3 py-1.5 text-xs font-medium text-white"
                    : "px-3 py-1.5 text-xs text-muted hover:bg-brand-50")
                }
                style={party === o.key ? { backgroundColor: o.color } : undefined}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-muted">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-foreground"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-muted">
            {filtered.length.toLocaleString("en-US")} of{" "}
            {entries.length.toLocaleString("en-US")}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="max-h-[720px] overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-brand-50">
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Official</th>
                  <th className="px-4 py-2.5 font-medium">Office</th>
                  <th className="px-4 py-2.5 font-medium">State</th>
                  <th className="px-4 py-2.5 text-right font-medium">Votes on record</th>
                  <th className="px-4 py-2.5 text-right font-medium">Alignment</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}
                    className={
                      e.id === selectedId
                        ? "cursor-pointer bg-brand-100/70"
                        : "cursor-pointer hover:bg-brand-50/60"
                    }
                  >
                    <td className="border-b border-border px-4 py-2">
                      <div className="flex items-center gap-2">
                        <PartyDot party={e.party} />
                        <span className="font-medium text-brand-900">{e.name}</span>
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate border-b border-border px-4 py-2 text-muted">
                      {e.office}
                    </td>
                    <td className="border-b border-border px-4 py-2">{e.state}</td>
                    <td className="border-b border-border px-4 py-2 text-right tabular-nums">
                      {e.votesRecorded > 0 ? e.votesRecorded : ""}
                    </td>
                    <td className="border-b border-border px-4 py-2 text-right tabular-nums">
                      {e.alignedPct != null ? (
                        <span className="font-medium text-brand-800">{e.alignedPct}%</span>
                      ) : (
                        <span className="text-xs text-muted">not scored</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Click any row to open the scorecard. Senate and House rosters come
          from live synced roll calls. State and local coverage currently
          includes officials tracked by Tally (New York City today) and grows
          with the consumer app.
        </p>
      </div>
    </div>
  );
}
