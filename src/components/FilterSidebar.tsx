"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { GeoMap } from "@/components/GeoMap";
import {
  AGE_OPTIONS,
  PARTY_OPTIONS,
  RACE_OPTIONS,
  SEX_OPTIONS,
  districtLabel,
  parseAudience,
} from "@/lib/filters";

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
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [zoomState, setZoomState] = useState<string | null>(null);

  const rootOfState = (abbr: string) => {
    const roots = districts.filter(
      (d) => d.state === abbr && d.district_id === d.root_district
    );
    if (roots.length === 0) return null;
    return roots.sort((a, b) => b.n - a.n)[0].district_id;
  };

  const f0 = parseAudience(Object.fromEntries(sp.entries()));
  const selectedStateFromFilter = f0.district
    ? (districts.find((d) => d.district_id === f0.district)?.state ??
       districts.find((d) => d.root_district === f0.district)?.state ??
       null)
    : null;

  const f = parseAudience(Object.fromEntries(sp.entries()));

  const apply = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  const toggleList = (key: "party" | "age" | "sex" | "race", value: string) => {
    const cur = new Set(f[key]);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    apply({ [key]: [...cur].join(",") || null });
  };

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of districts) {
      if (d.state && d.state !== "US") counts[d.state] = (counts[d.state] ?? 0) + d.n;
    }
    return counts;
  }, [districts]);

  const stateDistricts = useMemo(() => {
    if (!zoomState) return [];
    return districts
      .filter((d) => d.state === zoomState)
      .sort((a, b) => b.n - a.n);
  }, [districts, zoomState]);

  const activeCount =
    (f.district ? 1 : 0) + f.party.length + f.age.length + f.sex.length + f.race.length;

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
    <aside className="sticky top-20 h-fit w-[340px] shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-brand-50 px-3 py-2">
        <span className="text-sm font-semibold text-brand-900">
          Filter the audience{activeCount > 0 ? ` (${activeCount})` : ""}
        </span>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setZoomState(null);
                apply({ d: null, exact: null, party: null, age: null, sex: null, race: null });
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
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Chip
            active={!f.district}
            onClick={() => {
              setZoomState(null);
              apply({ d: null, exact: null });
            }}
          >
            All entitled
          </Chip>
          {districts
            .filter((d) => d.district_id === d.root_district)
            .map((d) => (
              <Chip
                key={d.district_id}
                active={f.district === d.district_id && !f.exact}
                onClick={() => apply({ d: d.district_id, exact: null })}
              >
                {districtLabel(d.district_id)}
              </Chip>
            ))}
        </div>
        <GeoMap
          counts={stateCounts}
          selectedState={selectedStateFromFilter}
          onSelectState={(s) => {
            setZoomState(s);
            if (!s) apply({ d: null, exact: null });
            else {
              const root = rootOfState(s);
              if (root) apply({ d: root, exact: null });
            }
          }}
          councilDistricts={districts
            .filter((d) => d.district_id.includes("-cc-"))
            .map((d) => ({ id: d.district_id, label: d.district_id, n: d.n }))}
          selectedDistrict={f.exact ? f.district : null}
          onSelectDistrict={(id) =>
            id ? apply({ d: id, exact: "1" }) : apply({ d: null, exact: null })
          }
          height={260}
        />
        {zoomState && (
          <div className="mt-2">
            <div className="mb-1 text-xs text-muted">
              Districts in {zoomState} (click to zoom in):
            </div>
            {!hasExactFeature && (
              <div className="mb-1 text-xs text-muted">
                Exact district filtering is a premium dimension.
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {stateDistricts.map((d) => {
                const exact = d.district_id !== d.root_district;
                return (
                  <Chip
                    key={d.district_id}
                    active={f.district === d.district_id && f.exact === exact}
                    onClick={() =>
                      apply({ d: d.district_id, exact: exact ? "1" : null })
                    }
                  >
                    {districtLabel(d.district_id)}{" "}
                    <span className="opacity-70">
                      {d.n.toLocaleString("en-US")}
                    </span>
                  </Chip>
                );
              })}
              {stateDistricts.length === 0 && (
                <span className="text-xs text-muted">No responses in this state yet.</span>
              )}
            </div>
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
