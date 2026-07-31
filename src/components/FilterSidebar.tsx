"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { GeoMap, type GeoFocus } from "@/components/GeoMap";
import { US_STATES } from "@/lib/usStatesGeo";
import {
  AGE_OPTIONS,
  PARTY_OPTIONS,
  RACE_OPTIONS,
  SEX_OPTIONS,
  districtLabel,
  parseAudience,
} from "@/lib/filters";

const NYC_BOUNDS: [number, number, number, number] = [866.58, 210.73, 874.8, 221.51];

/* Generated geometry paths are absolute move and line commands, so the
   coordinate stream alternates x,y and a numeric scan finds the bounds. */
function pathBounds(d: string): [number, number, number, number] {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    if (nums[i] < x0) x0 = nums[i];
    if (nums[i] > x1) x1 = nums[i];
    if (nums[i + 1] < y0) y0 = nums[i + 1];
    if (nums[i + 1] > y1) y1 = nums[i + 1];
  }
  return [x0, y0, x1, y1];
}

type SearchResult = { key: string; label: string; sub: string; run: () => void };

export type AvailableDistrict = {
  district_id: string;
  root_district: string;
  n: number;
  state: string;
};

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-d)",
  R: "var(--party-r)",
  I: "var(--party-i)",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-3 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md px-2 py-1 text-xs font-medium text-white"
          : "rounded-md border border-border bg-white px-2 py-1 text-xs text-muted hover:bg-brand-50"
      }
      style={active ? { backgroundColor: color ?? "var(--brand-600)" } : undefined}
    >
      {children}
    </button>
  );
}

export function FilterSidebar({
  districts,
  hasExactFeature,
}: {
  districts: AvailableDistrict[];
  hasExactFeature: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  // Optimistic region selection: the map and breadcrumb move instantly
  // while the server render for the new audience streams in.
  const [pendingRegions, setPendingRegions] = useState<string[] | null>(null);
  const [focus, setFocus] = useState<GeoFocus | null>(null);
  const [countyGeo, setCountyGeo] = useState<Record<string, { name: string; d: string }[]> | null>(null);
  const focusSeq = useRef(0);

  const f = parseAudience(Object.fromEntries(sp.entries()));
  const regions = pendingRegions ?? f.districts;

  // The URL committed: drop the optimistic overlay.
  const spKey = sp.toString();
  useEffect(() => {
    setPendingRegions(null);
  }, [spKey]);

  const apply = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("exact");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  const setRegions = (list: string[]) => {
    setPendingRegions(list);
    apply({ d: list.join(",") || null });
  };

  const toggleList = (key: "party" | "age" | "sex" | "race", value: string) => {
    const cur = new Set(f[key]);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    apply({ [key]: [...cur].join(",") || null });
  };

  const rootOfState = (abbr: string) => {
    const roots = districts.filter(
      (d) => d.state === abbr && d.district_id === d.root_district
    );
    if (roots.length === 0) return null;
    return roots.sort((a, b) => b.n - a.n)[0].district_id;
  };

  // County names load lazily the first time a search needs them.
  useEffect(() => {
    if (query.trim().length >= 3 && !countyGeo) {
      fetch("/us-counties.json").then((r) => r.json()).then(setCountyGeo).catch(() => {});
    }
  }, [query, countyGeo]);

  const focusOn = (bounds: [number, number, number, number], pad?: number) =>
    setFocus({ key: `f${++focusSeq.current}`, bounds, pad });

  const pickState = (abbr: string) => {
    setQuery("");
    const st = US_STATES.find((s) => s.abbr === abbr);
    if (st) focusOn(st.bounds as [number, number, number, number]);
    const root = rootOfState(abbr);
    setRegions(root ? [root] : [abbr.toLowerCase()]);
  };
  const pickUS = () => {
    setQuery("");
    focusOn([0, 0, 975, 610], 0.01);
    setRegions(["us"]);
  };
  const pickNYC = () => {
    setQuery("");
    focusOn(NYC_BOUNDS, 0.15);
    setRegions(["nyc"]);
  };
  const pickCouncil = (id: string) => {
    setQuery("");
    focusOn(NYC_BOUNDS, 0.15);
    setRegions([id]);
  };
  const pickCounty = (st: string, county: { name: string; d: string }) => {
    setQuery("");
    // Counties select in place: zoom to the state, not the county.
    const stGeo = US_STATES.find((s) => s.abbr === st);
    focusOn(stGeo ? (stGeo.bounds as [number, number, number, number]) : pathBounds(county.d));
    const slug = county.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setRegions([`${st.toLowerCase()}-co-${slug}`]);
  };

  const results: SearchResult[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchResult[] = [];
    if ("united states".includes(q) || q === "us" || q === "usa" || "national".startsWith(q)) {
      out.push({ key: "us", label: "United States", sub: "national", run: pickUS });
    }
    if ("new york city".includes(q) || q === "nyc") {
      out.push({ key: "nyc", label: "New York City", sub: "city", run: pickNYC });
    }
    for (const s of US_STATES) {
      if (out.length >= 9) break;
      if (s.name.toLowerCase().includes(q) || s.abbr.toLowerCase() === q) {
        out.push({ key: s.abbr, label: s.name, sub: "state", run: () => pickState(s.abbr) });
      }
    }
    for (const d of districts) {
      if (out.length >= 10) break;
      if (!d.district_id.includes("-cc-")) continue;
      const num = d.district_id.split("-cc-")[1];
      if (`council district ${num}`.includes(q) || q === num) {
        out.push({
          key: d.district_id,
          label: `Council District ${num}`,
          sub: "New York City",
          run: () => pickCouncil(d.district_id),
        });
      }
    }
    if (countyGeo && q.length >= 3) {
      outer: for (const [st, list] of Object.entries(countyGeo)) {
        for (const c of list) {
          if (out.length >= 12) break outer;
          if (c.name.toLowerCase().startsWith(q)) {
            out.push({
              key: `${st}-${c.name}`,
              label: `${c.name} County`,
              sub: st,
              run: () => pickCounty(st, c),
            });
          }
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, countyGeo, districts]);

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of districts) {
      if (d.state && d.state !== "US") counts[d.state] = (counts[d.state] ?? 0) + d.n;
    }
    return counts;
  }, [districts]);

  const countyCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of districts) {
      if (d.district_id.includes("-co-")) m[d.district_id] = d.n;
    }
    return m;
  }, [districts]);

  // The dropdown lists the districts of the state the selection lives in.
  const dropdownState = useMemo(() => {
    const p = regions[0];
    if (!p) return null;
    return (
      districts.find((d) => d.district_id === p)?.state ??
      districts.find((d) => d.root_district === p)?.state ??
      null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions.join(","), districts]);

  const stateDistricts = useMemo(() => {
    if (!dropdownState) return [];
    return districts
      .filter((d) => d.state === dropdownState)
      .sort((a, b) => b.n - a.n);
  }, [districts, dropdownState]);

  const dropdownValue =
    regions.find((id) => stateDistricts.some((d) => d.district_id === id)) ?? "";

  const activeCount =
    f.districts.length + f.party.length + f.age.length + f.sex.length + f.race.length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sticky top-20 flex h-fit flex-col items-center gap-2 rounded-xl border border-border bg-card px-2 py-3 text-xs text-muted shadow-sm hover:bg-brand-50"
        title="Open filters"
      >
        <span>▶</span>
        <span style={{ writingMode: "vertical-rl" }}>
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </span>
      </button>
    );
  }

  return (
    <aside className="sticky top-20 h-fit w-[440px] shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-brand-50 px-3 py-2">
        <span className="text-sm font-semibold text-brand-900">
          Filter the audience{activeCount > 0 ? ` (${activeCount})` : ""}
          {isPending && (
            <span className="ml-2 text-xs font-normal text-brand-600">updating…</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                apply({ d: null, party: null, age: null, sex: null, race: null });
              }}
              className="text-xs text-brand-700 hover:underline"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted hover:text-brand-800"
            title="Collapse"
          >
            ◀
          </button>
        </div>
      </div>

      <Section title="Region">
        <div className="relative mb-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a state, county, or district..."
            className="w-full rounded-md border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-white shadow-lg">
              {results.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={r.run}
                  className="flex w-full items-baseline justify-between px-3 py-1.5 text-left text-sm hover:bg-brand-50"
                >
                  <span className="font-medium text-brand-900">{r.label}</span>
                  <span className="text-xs text-muted">{r.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <GeoMap
          counts={stateCounts}
          selectedRegions={regions}
          onSelectRegions={setRegions}
          councilDistricts={districts
            .filter((d) => d.district_id.includes("-cc-"))
            .map((d) => ({ id: d.district_id, label: d.district_id, n: d.n }))}
          countyCounts={countyCounts}
          focus={focus}
          height={380}
        />
        {dropdownState && stateDistricts.length > 1 && (
          <div className="mt-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              Districts in {dropdownState}:
              <select
                value={dropdownValue}
                onChange={(e) => {
                  if (e.target.value) setRegions([e.target.value]);
                }}
                className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
              >
                <option value="">Choose a district or county...</option>
                {stateDistricts.map((d) => (
                  <option key={d.district_id} value={d.district_id}>
                    {districtLabel(d.district_id)} ({d.n.toLocaleString("en-US")})
                  </option>
                ))}
              </select>
            </label>
            {!hasExactFeature && (
              <div className="mt-1 text-xs text-muted">
                Exact district filtering is a premium dimension.
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Party">
        <div className="flex flex-wrap gap-1.5">
          {PARTY_OPTIONS.map((p) => (
            <Chip
              key={p.key}
              active={f.party.includes(p.key)}
              onClick={() => toggleList("party", p.key)}
              color={PARTY_COLOR[p.key]}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Age">
        <div className="flex flex-wrap gap-1.5">
          {AGE_OPTIONS.map((a) => (
            <Chip key={a} active={f.age.includes(a)} onClick={() => toggleList("age", a)}>
              {a === "unknown" ? "Unknown" : a}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Sex">
        <div className="flex flex-wrap gap-1.5">
          {SEX_OPTIONS.map((s) => (
            <Chip
              key={s.key}
              active={f.sex.includes(s.key)}
              onClick={() => toggleList("sex", s.key)}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Race">
        <div className="flex flex-wrap gap-1.5">
          {RACE_OPTIONS.map((r) => (
            <Chip key={r} active={f.race.includes(r)} onClick={() => toggleList("race", r)}>
              {r === "unknown" ? "Not stated" : r}
            </Chip>
          ))}
        </div>
      </Section>
    </aside>
  );
}
