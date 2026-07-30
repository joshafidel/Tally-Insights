"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { US_STATES } from "@/lib/usStatesGeo";

/*
  Election night style map, shared by topics, bills, items, and officials.
    Scroll wheel zooms toward the cursor (registered non passive so the page
    never scrolls instead), drag pans.
    State abbreviations render with a white halo and rescale continuously
    with zoom so they stay legible at every level.
    Single click selects and highlights a state and filters results to it.
    Sub districts (the real 51 NYC council boundaries) appear only past a
    zoom threshold and require a DOUBLE click to select, so a state can
    never be mis picked as a district. Selected shapes get a bold outline.
    Counties fade in when zoomed into a state, for geographic context.
*/

const FULL: [number, number, number, number] = [0, 0, 975, 610];
const SMALL_STATES = new Set(["CT", "RI", "DE", "NJ", "MD", "MA", "NH", "VT", "DC"]);
const COUNTY_VB = 260; // show counties when viewBox width is below this
const DISTRICT_VB = 45; // show sub districts when viewBox width is below this

type CountyShape = { name: string; d: string };
type CouncilShape = { num: number; d: string; centroid: number[] };

export type GeoDistrictOption = { id: string; label: string; n: number };

export function GeoMap({
  counts,
  selectedState,
  onSelectState,
  councilDistricts,
  selectedDistrict,
  onSelectDistrict,
  height = 340,
  legend = "responses",
}: {
  counts: Record<string, number>;
  selectedState: string | null;
  onSelectState: (s: string | null) => void;
  councilDistricts?: GeoDistrictOption[];
  selectedDistrict?: string | null;
  onSelectDistrict?: (id: string | null) => void;
  height?: number;
  legend?: string;
}) {
  const [vb, setVb] = useState<[number, number, number, number]>(FULL);
  const [counties, setCounties] = useState<Record<string, CountyShape[]> | null>(null);
  const [council, setCouncil] = useState<CouncilShape[] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

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
    if (vb[2] > COUNTY_VB) return null;
    const cx = vb[0] + vb[2] / 2;
    const cy = vb[1] + vb[3] / 2;
    return (
      US_STATES.find((s) => {
        const [x0, y0, x1, y1] = s.bounds;
        return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
      })?.abbr ?? null
    );
  }, [vb]);

  const showDistricts = vb[2] < DISTRICT_VB && (councilDistricts?.length ?? 0) > 0;

  useEffect(() => {
    if (zoomedState && !counties) {
      fetch("/us-counties.json").then((r) => r.json()).then(setCounties).catch(() => {});
    }
  }, [zoomedState, counties]);
  useEffect(() => {
    if (vb[2] < DISTRICT_VB * 3 && !council && (councilDistricts?.length ?? 0) > 0) {
      fetch("/nyc-council.json").then((r) => r.json()).then(setCouncil).catch(() => {});
    }
  }, [vb, council, councilDistricts]);

  // Non passive wheel listener: React's synthetic onWheel cannot
  // preventDefault, which is why the page scrolled instead of zooming.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.18 : 0.85;
      const [x, y, w, h] = vbRef.current;
      const nw = Math.min(Math.max(w * factor, 1.5), 1100);
      const nh = nw * (h / w);
      const cx = x + w * px;
      const cy = y + h * py;
      setVb([cx - nw * px, cy - nh * py, nw, nh]);
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  const zoomTo = (bounds: number[], pad = 0.3) => {
    const [x0, y0, x1, y1] = bounds;
    const padX = Math.max((x1 - x0) * pad, 8);
    const padY = Math.max((y1 - y0) * pad, 8);
    setVb([x0 - padX, y0 - padY, x1 - x0 + padX * 2, y1 - y0 + padY * 2]);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !svgRef.current || e.buttons !== 1) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / rect.width) * vb[2];
    const dy = ((e.clientY - drag.current.y) / rect.height) * vb[3];
    if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 3) {
      drag.current.moved = true;
    }
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    setVb(([x, y, w, h]) => [x - dx, y - dy, w, h]);
  };
  const wasDrag = () => Boolean(drag.current?.moved);
  const onPointerUp = () => {
    setTimeout(() => (drag.current = null), 0);
  };

  // Labels rescale continuously with zoom and carry a white halo.
  const stateLabel = Math.min(Math.max(vb[2] / 42, 0.5), 20);
  const districtLabelSize = Math.max(vb[2] / 38, 0.35);

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

  const councilCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of councilDistricts ?? []) m.set(d.id, d.n);
    return m;
  }, [councilDistricts]);
  const councilMax = Math.max(1, ...[...councilCounts.values()]);

  const clickState = (abbr: string) => {
    if (wasDrag()) return;
    const st = US_STATES.find((s) => s.abbr === abbr)!;
    if (selectedState === abbr) {
      onSelectState(null);
    } else {
      onSelectState(abbr);
      zoomTo(st.bounds);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        {vb !== FULL && (
          <button
            type="button"
            className="rounded border border-border bg-white px-2 py-0.5 text-muted hover:bg-brand-50"
            onClick={() => setVb(FULL)}
          >
            Reset zoom
          </button>
        )}
        <span className="ml-auto text-muted">
          scroll to zoom, drag to pan
          {showDistricts ? ", double click a district to select it" : ""}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={vb.join(" ")}
        style={{ height, touchAction: "none" }}
        className="w-full cursor-grab rounded-lg border border-border bg-[#eef3f8] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="img"
        aria-label="United States map"
      >
        {zoomedState &&
          counties?.[zoomedState]?.map((c, i) => (
            <path
              key={i}
              d={c.d}
              fill="none"
              stroke="var(--brand-300)"
              strokeWidth={0.7}
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
            fillOpacity={selectedState && selectedState !== s.abbr ? 0.45 : 1}
            stroke={selectedState === s.abbr ? "var(--brand-900)" : "#5b5470"}
            strokeWidth={selectedState === s.abbr ? 2.5 : 1}
            vectorEffect="non-scaling-stroke"
            className="cursor-pointer transition-opacity hover:opacity-85"
            pointerEvents={showDistricts ? "none" : "auto"}
            onClick={() => clickState(s.abbr)}
          >
            <title>{`${s.name}: ${(counts[s.abbr] ?? 0).toLocaleString("en-US")} ${legend}`}</title>
          </path>
        ))}

        {/* Sub districts appear only past the zoom threshold */}
        {showDistricts &&
          (council ?? []).map((c) => {
            const id = `nyc-cc-${c.num}`;
            const isSel = selectedDistrict === id;
            const n = councilCounts.get(id) ?? 0;
            return (
              <path
                key={c.num}
                d={c.d}
                fill={
                  isSel
                    ? "var(--brand-700)"
                    : n === 0
                      ? "white"
                      : n / councilMax > 0.5
                        ? "var(--brand-500)"
                        : "var(--brand-300)"
                }
                fillOpacity={isSel ? 1 : 0.9}
                stroke={isSel ? "var(--brand-900)" : "#3a5a86"}
                strokeWidth={isSel ? 3 : 1.25}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer hover:opacity-85"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelectDistrict?.(isSel ? null : id);
                }}
              >
                <title>{`Council District ${c.num}: ${n.toLocaleString("en-US")} ${legend} (double click to select)`}</title>
              </path>
            );
          })}
        {showDistricts &&
          (council ?? []).map((c) => (
            <text
              key={`ct${c.num}`}
              x={c.centroid[0]}
              y={c.centroid[1]}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none select-none"
              fontSize={districtLabelSize}
              fontWeight={700}
              fill="#1d3557"
              stroke="white"
              strokeWidth={districtLabelSize / 6}
              paintOrder="stroke"
            >
              {String(c.num).padStart(2, "0")}
            </text>
          ))}

        {/* State abbreviations: halo + continuous rescale */}
        {!showDistricts &&
          US_STATES.filter((s) => !SMALL_STATES.has(s.abbr)).map((s) => (
            <text
              key={s.abbr}
              x={s.centroid[0]}
              y={s.centroid[1]}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none select-none"
              fontSize={stateLabel}
              fontWeight={700}
              fill="var(--brand-900)"
              stroke="white"
              strokeWidth={stateLabel / 5.5}
              paintOrder="stroke"
            >
              {s.abbr}
            </text>
          ))}
        {vb[2] > 600 &&
          smallLabels.map((l) => (
            <g key={l.abbr} className="cursor-pointer" onClick={() => clickState(l.abbr)}>
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
                fontSize={13}
                fontWeight={700}
                fill="var(--brand-900)"
                stroke="white"
                strokeWidth={2.2}
                paintOrder="stroke"
              >
                {l.abbr}
              </text>
            </g>
          ))}
      </svg>

      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
        <span>Fewer</span>
        {["var(--brand-50)", "var(--brand-300)", "var(--brand-400)", "var(--brand-500)", "var(--brand-700)"].map((c) => (
          <span key={c} className="h-3 w-5 rounded-sm border border-border" style={{ backgroundColor: c }} />
        ))}
        <span>More {legend}</span>
      </div>
    </div>
  );
}
