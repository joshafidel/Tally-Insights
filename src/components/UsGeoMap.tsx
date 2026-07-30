"use client";

import { useMemo, useState } from "react";
import { US_STATES } from "@/lib/usStatesGeo";

/*
  Geographic US map (real census state shapes, Albers projection) for finding
  officials. Fill encodes how many officials match the current filters.
  Small northeastern states get leader lines to labels in a side column.
  Clicking a state selects it as a filter and zooms the viewport to it;
  clicking it again (or Reset) zooms back out.
*/
const SMALL_STATES = new Set(["CT", "RI", "DE", "NJ", "MD", "MA", "NH", "VT", "DC"]);
const FULL_VIEW = "0 0 975 610";

export function UsGeoMap({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (state: string | null) => void;
}) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const max = Math.max(1, ...Object.values(counts));
  const fill = (abbr: string) => {
    const n = counts[abbr] ?? 0;
    if (n === 0) return "var(--brand-50)";
    const t = n / max;
    if (t > 0.75) return "var(--brand-700)";
    if (t > 0.5) return "var(--brand-500)";
    if (t > 0.25) return "var(--brand-400)";
    return "var(--brand-300)";
  };

  const smallLabelPositions = useMemo(() => {
    const smalls = US_STATES.filter((s) => SMALL_STATES.has(s.abbr)).sort(
      (a, b) => a.centroid[1] - b.centroid[1]
    );
    return smalls.map((s, i) => ({
      abbr: s.abbr,
      from: s.centroid,
      to: [905, 120 + i * 34] as [number, number],
    }));
  }, []);

  const zoomedState = US_STATES.find((s) => s.abbr === zoomed);
  const viewBox = zoomedState
    ? (() => {
        const [x0, y0, x1, y1] = zoomedState.bounds;
        const padX = Math.max((x1 - x0) * 0.25, 20);
        const padY = Math.max((y1 - y0) * 0.25, 20);
        return `${x0 - padX} ${y0 - padY} ${x1 - x0 + padX * 2} ${y1 - y0 + padY * 2}`;
      })()
    : FULL_VIEW;

  const clickState = (abbr: string) => {
    if (zoomed === abbr) {
      setZoomed(null);
      onSelect(selected === abbr ? null : abbr);
    } else {
      setZoomed(abbr);
      onSelect(abbr);
    }
  };

  return (
    <div>
      <svg viewBox={viewBox} className="w-full" role="img" aria-label="United States map">
        {US_STATES.map((s) => (
          <path
            key={s.abbr}
            d={s.d}
            fill={fill(s.abbr)}
            stroke={selected === s.abbr ? "var(--brand-900)" : "white"}
            strokeWidth={selected === s.abbr ? 2 : 0.75}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => clickState(s.abbr)}
          >
            <title>{`${s.name}: ${counts[s.abbr] ?? 0} officials`}</title>
          </path>
        ))}
        {/* Abbreviation labels on the state itself */}
        {US_STATES.filter((s) => !SMALL_STATES.has(s.abbr)).map((s) => (
          <text
            key={s.abbr}
            x={s.centroid[0]}
            y={s.centroid[1]}
            textAnchor="middle"
            dominantBaseline="middle"
            className="pointer-events-none select-none"
            fontSize={zoomed ? 10 : 13}
            fontWeight={600}
            fill={(counts[s.abbr] ?? 0) / max > 0.5 ? "white" : "var(--brand-900)"}
          >
            {s.abbr}
          </text>
        ))}
        {/* Small states: leader lines to a label column */}
        {!zoomed &&
          smallLabelPositions.map((l) => (
            <g key={l.abbr} className="cursor-pointer" onClick={() => clickState(l.abbr)}>
              <line
                x1={l.from[0]}
                y1={l.from[1]}
                x2={l.to[0]}
                y2={l.to[1]}
                stroke="var(--muted)"
                strokeWidth={0.75}
              />
              <text
                x={l.to[0] + 4}
                y={l.to[1]}
                dominantBaseline="middle"
                fontSize={13}
                fontWeight={600}
                fill="var(--brand-900)"
              >
                {l.abbr}
              </text>
            </g>
          ))}
      </svg>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span>Fewer</span>
        {["var(--brand-50)", "var(--brand-300)", "var(--brand-400)", "var(--brand-500)", "var(--brand-700)"].map((c) => (
          <span key={c} className="h-3 w-6 rounded-sm border border-border" style={{ backgroundColor: c }} />
        ))}
        <span>More officials</span>
        {(zoomed || selected) && (
          <button
            type="button"
            className="ml-auto text-brand-700 underline-offset-2 hover:underline"
            onClick={() => {
              setZoomed(null);
              onSelect(null);
            }}
          >
            Reset map
          </button>
        )}
      </div>
    </div>
  );
}
