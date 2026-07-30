"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { US_STATES } from "@/lib/usStatesGeo";

/*
  Election night style map. One component, three layers:
    nation: census state shapes with abbreviations, leader lines for the
            small northeastern states, choropleth fill
    state zoom: scroll wheel or click zooms in; county boundaries fade in
            for geographic context
    city view: for New York City, the real 51 council districts render as
            their own map (like the districting commission plan) and are
            clickable filters
  Scroll wheel zooms toward the cursor everywhere; drag pans. Borders use
  non scaling strokes so they stay crisp at any zoom.
*/

const SMALL_STATES = new Set(["CT", "RI", "DE", "NJ", "MD", "MA", "NH", "VT", "DC"]);
const FULL: [number, number, number, number] = [0, 0, 975, 610];

type CountyShape = { name: string; d: string };
type CouncilShape = { num: number; d: string; centroid: number[] };

export type GeoDistrictOption = {
  id: string;
  label: string;
  n: number;
};

export function GeoMap({
  counts,
  selectedState,
  onSelectState,
  councilDistricts,
  selectedDistrict,
  onSelectDistrict,
  height = 340,
}: {
  counts: Record<string, number>;
  selectedState: string | null;
  onSelectState: (s: string | null) => void;
  councilDistricts?: GeoDistrictOption[];
  selectedDistrict?: string | null;
  onSelectDistrict?: (id: string | null) => void;
  height?: number;
}) {
  const [vb, setVb] = useState<[number, number, number, number]>(FULL);
  const [mode, setMode] = useState<"nation" | "council">("nation");
  const [counties, setCounties] = useState<Record<string, CountyShape[]> | null>(null);
  const [council, setCouncil] = useState<CouncilShape[] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

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

  const zoomedState = useMemo(() => {
    if (mode !== "nation") return null;
    const zoomFactor = FULL[2] / vb[2];
    if (zoomFactor < 2.2) return null;
    const cx = vb[0] + vb[2] / 2;
    const cy = vb[1] + vb[3] / 2;
    return (
      US_STATES.find((s) => {
        const [x0, y0, x1, y1] = s.bounds;
        return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
      })?.abbr ?? null
    );
  }, [vb, mode]);

  // Lazy layers
  useEffect(() => {
    if (zoomedState && !counties) {
      fetch("/us-counties.json").then((r) => r.json()).then(setCounties).catch(() => {});
    }
  }, [zoomedState, counties]);
  useEffect(() => {
    if (mode === "council" && !council) {
      fetch("/nyc-council.json").then((r) => r.json()).then(setCouncil).catch(() => {});
    }
  }, [mode, council]);

  const zoomTo = (bounds: number[], pad = 0.3) => {
    const [x0, y0, x1, y1] = bounds;
    const padX = Math.max((x1 - x0) * pad, 15);
    const padY = Math.max((y1 - y0) * pad, 15);
    setVb([x0 - padX, y0 - padY, x1 - x0 + padX * 2, y1 - y0 + padY * 2]);
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const factor = e.deltaY > 0 ? 1.18 : 0.85;
    setVb(([x, y, w, h]) => {
      const nw = Math.min(Math.max(w * factor, 25), 1100);
      const nh = nw * (h / w);
      const cx = x + w * px;
      const cy = y + h * py;
      return [cx - nw * px, cy - nh * py, nw, nh];
    });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !svgRef.current) return;
    if (e.buttons !== 1) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / rect.width) * vb[2];
    const dy = ((e.clientY - drag.current.y) / rect.height) * vb[3];
    drag.current = { x: e.clientX, y: e.clientY };
    setVb(([x, y, w, h]) => [x - dx, y - dy, w, h]);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const labelSize = Math.max(vb[2] / 75, 3);
  const hasCouncilView = (councilDistricts?.length ?? 0) > 0;

  const smallLabels = useMemo(() => {
    const smalls = US_STATES.filter((s) => SMALL_STATES.has(s.abbr)).sort(
      (a, b) => a.centroid[1] - b.centroid[1]
    );
    return smalls.map((s, i) => ({
      abbr: s.abbr,
      from: s.centroid,
      to: [908, 118 + i * 36] as [number, number],
    }));
  }, []);

  const districtIdOf = (num: number) => `nyc-cc-${num}`;
  const councilCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of councilDistricts ?? []) m.set(d.id, d.n);
    return m;
  }, [councilDistricts]);
  const councilMax = Math.max(1, ...[...councilCounts.values()]);
  const councilFill = (num: number) => {
    const n = councilCounts.get(districtIdOf(num)) ?? 0;
    if (n === 0) return "white";
    const t = n / councilMax;
    if (t > 0.75) return "var(--brand-700)";
    if (t > 0.5) return "var(--brand-500)";
    if (t > 0.25) return "var(--brand-400)";
    return "var(--brand-300)";
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        {mode === "council" ? (
          <button
            type="button"
            className="rounded border border-border bg-white px-2 py-0.5 text-brand-700 hover:bg-brand-50"
            onClick={() => {
              setMode("nation");
              setVb(FULL);
            }}
          >
            ← Back to US map
          </button>
        ) : (
          <>
            {hasCouncilView && (
              <button
                type="button"
                className="rounded border border-border bg-white px-2 py-0.5 text-brand-700 hover:bg-brand-50"
                onClick={() => {
                  setMode("council");
                  setVb(FULL);
                }}
              >
                NYC council districts
              </button>
            )}
            {vb !== FULL && (
              <button
                type="button"
                className="rounded border border-border bg-white px-2 py-0.5 text-muted hover:bg-brand-50"
                onClick={() => setVb(FULL)}
              >
                Reset zoom
              </button>
            )}
          </>
        )}
        <span className="ml-auto text-muted">scroll to zoom, drag to pan</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={vb.join(" ")}
        style={{ height, touchAction: "none" }}
        className="w-full cursor-grab rounded-lg border border-border bg-[#eef3f8] active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="img"
        aria-label={mode === "council" ? "NYC council district map" : "United States map"}
      >
        {mode === "nation" && (
          <>
            {/* County context inside the zoomed state */}
            {zoomedState &&
              counties?.[zoomedState]?.map((c, i) => (
                <path
                  key={i}
                  d={c.d}
                  fill="none"
                  stroke="var(--brand-300)"
                  strokeWidth={0.75}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`${c.name} County`}</title>
                </path>
              ))}
            {US_STATES.map((s) => (
              <path
                key={s.abbr}
                d={s.d}
                fill={fill(s.abbr)}
                fillOpacity={zoomedState && zoomedState !== s.abbr ? 0.5 : 1}
                stroke={selectedState === s.abbr ? "var(--brand-900)" : "#5b5470"}
                strokeWidth={selectedState === s.abbr ? 2.25 : 1}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer transition-opacity hover:opacity-85"
                onClick={() => {
                  if (selectedState === s.abbr) {
                    onSelectState(null);
                    setVb(FULL);
                  } else {
                    onSelectState(s.abbr);
                    zoomTo(s.bounds);
                  }
                }}
              >
                <title>{`${s.name}: ${(counts[s.abbr] ?? 0).toLocaleString("en-US")}`}</title>
              </path>
            ))}
            {US_STATES.filter((s) => !SMALL_STATES.has(s.abbr)).map((s) => (
              <text
                key={s.abbr}
                x={s.centroid[0]}
                y={s.centroid[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                fontSize={Math.min(labelSize * 1.05, 14)}
                fontWeight={600}
                fill={(counts[s.abbr] ?? 0) / max > 0.5 ? "white" : "var(--brand-900)"}
              >
                {s.abbr}
              </text>
            ))}
            {vb[2] > 600 &&
              smallLabels.map((l) => (
                <g
                  key={l.abbr}
                  className="cursor-pointer"
                  onClick={() => {
                    const st = US_STATES.find((s) => s.abbr === l.abbr)!;
                    onSelectState(l.abbr);
                    zoomTo(st.bounds);
                  }}
                >
                  <line
                    x1={l.from[0]}
                    y1={l.from[1]}
                    x2={l.to[0]}
                    y2={l.to[1]}
                    stroke="var(--muted)"
                    strokeWidth={0.8}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={l.to[0] + 4}
                    y={l.to[1]}
                    dominantBaseline="middle"
                    fontSize={12.5}
                    fontWeight={600}
                    fill="var(--brand-900)"
                  >
                    {l.abbr}
                  </text>
                </g>
              ))}
          </>
        )}

        {mode === "council" && (
          <>
            {(council ?? []).map((c) => {
              const id = districtIdOf(c.num);
              const isSel = selectedDistrict === id;
              return (
                <path
                  key={c.num}
                  d={c.d}
                  fill={councilFill(c.num)}
                  stroke={isSel ? "var(--brand-900)" : "#3a5a86"}
                  strokeWidth={isSel ? 2.5 : 1}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer hover:opacity-85"
                  onClick={() => onSelectDistrict?.(isSel ? null : id)}
                >
                  <title>{`Council District ${c.num}: ${(councilCounts.get(id) ?? 0).toLocaleString("en-US")} responses`}</title>
                </path>
              );
            })}
            {(council ?? []).map((c) => (
              <text
                key={`t${c.num}`}
                x={c.centroid[0]}
                y={c.centroid[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                fontSize={Math.max(vb[2] / 70, 6)}
                fontWeight={600}
                fill={
                  (councilCounts.get(districtIdOf(c.num)) ?? 0) / councilMax > 0.5
                    ? "white"
                    : "#1d3557"
                }
              >
                {String(c.num).padStart(2, "0")}
              </text>
            ))}
            {!council && (
              <text x={487} y={305} textAnchor="middle" fontSize={16} fill="var(--muted)">
                Loading district boundaries...
              </text>
            )}
          </>
        )}
      </svg>

      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
        <span>Fewer</span>
        {["var(--brand-50)", "var(--brand-300)", "var(--brand-400)", "var(--brand-500)", "var(--brand-700)"].map((c) => (
          <span key={c} className="h-3 w-5 rounded-sm border border-border" style={{ backgroundColor: c }} />
        ))}
        <span>More responses</span>
      </div>
    </div>
  );
}
