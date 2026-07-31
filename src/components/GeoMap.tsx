"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { US_STATES } from "@/lib/usStatesGeo";
import { US_CITIES } from "@/lib/usCities";
import { districtLabel } from "@/lib/filters";

/*
  Election night style map, shared by topics, bills, items, and officials.
    A breadcrumb above the map (United States > State > County) jumps
    between zoom levels. One click selects a state and glides the camera
    to it; with counties (or congressional districts) showing, one click
    selects that shape without zooming further. Holding cmd or ctrl
    toggles shapes into a multi selection. The viewport is clamped so the
    country never leaves view and cannot zoom out past full frame, and
    every programmatic move is an eased animation, not a cut.
*/

const FULL: [number, number, number, number] = [0, 0, 975, 610];
const RATIO = FULL[3] / FULL[2];
const SMALL_STATES = new Set(["CT", "RI", "DE", "NJ", "MD", "MA", "NH", "VT", "DC"]);
// Tall states (CA, TX) fit at ~800 wide in the 975x610 frame, so the sub
// layer threshold must sit above every state's fitted view width.
const SUB_VB = 830;
const OUTLINE_VB = 170; // council boundaries become visible below this
const DISTRICT_VB = 45; // council districts become interactive below this

function countySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type CountyShape = { name: string; d: string };
type CdShape = { num: string; d: string };
type CouncilShape = { num: number; d: string; centroid: number[] };

export type GeoDistrictOption = { id: string; label: string; n: number };
export type GeoFocus = {
  key: string;
  bounds: [number, number, number, number];
  pad?: number;
  minPad?: number;
};

/* Fit bounds into a viewport that keeps the full map's aspect ratio. */
function fitBounds(bounds: number[], pad = 0.25): [number, number, number, number] {
  const [x0, y0, x1, y1] = bounds;
  const bw = (x1 - x0) * (1 + pad * 2);
  const bh = (y1 - y0) * (1 + pad * 2);
  const w = Math.min(Math.max(bw, bh / RATIO, 6), FULL[2]);
  const h = w * RATIO;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return clampVb([cx - w / 2, cy - h / 2, w, h]);
}

/* America never leaves the frame and full frame is the max zoom out. */
function clampVb([x, y, w]: number[]): [number, number, number, number] {
  const cw = Math.min(w, FULL[2]);
  const ch = cw * RATIO;
  const cx = Math.min(Math.max(x, 0), FULL[2] - cw);
  const cy = Math.min(Math.max(y, 0), FULL[3] - ch);
  return [cx, cy, cw, ch];
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function GeoMap({
  counts,
  selectedRegions,
  onSelectRegions,
  councilDistricts,
  countyCounts,
  subLayer = "counties",
  focus,
  height = 340,
  legend = "responses",
}: {
  counts: Record<string, number>;
  selectedRegions: string[];
  onSelectRegions: (next: string[]) => void;
  councilDistricts?: GeoDistrictOption[];
  countyCounts?: Record<string, number>;
  subLayer?: "counties" | "congressional";
  focus?: GeoFocus | null;
  height?: number;
  legend?: string;
}) {
  const [vb, setVb] = useState<[number, number, number, number]>(FULL);
  const [counties, setCounties] = useState<Record<string, CountyShape[]> | null>(null);
  const [cds, setCds] = useState<Record<string, CdShape[]> | null>(null);
  const [council, setCouncil] = useState<CouncilShape[] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const anim = useRef<number | null>(null);

  const animateTo = useCallback((target: [number, number, number, number]) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = vbRef.current;
    const to = clampVb(target);
    const start = performance.now();
    const DURATION = 650;
    const step = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      const k = easeInOut(t);
      const w = from[2] + (to[2] - from[2]) * k;
      setVb([
        from[0] + (to[0] - from[0]) * k,
        from[1] + (to[1] - from[1]) * k,
        w,
        w * RATIO,
      ]);
      if (t < 1) anim.current = requestAnimationFrame(step);
      else anim.current = null;
    };
    anim.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

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

  const selected = useMemo(() => new Set(selectedRegions), [selectedRegions]);
  const selectedStateAbbrs = useMemo(
    () =>
      new Set(
        selectedRegions
          .filter((r) => /^[a-z]{2}$/.test(r) && r !== "us")
          .map((r) => r.toUpperCase())
      ),
    [selectedRegions]
  );
  const primary = selectedRegions[0] ?? null;
  const primaryStateAbbr = primary
    ? primary === "nyc"
      ? "NY"
      : primary.slice(0, 2).toUpperCase()
    : null;

  /* Which state's sub shapes to draw: the smallest state whose bounding
     box contains the view center, preferring a selected state. Smallest
     wins so Nevada is never mistaken for California's larger box. */
  /* Subdivisions belong to the CLICKED state only. Scroll zooming over a
     state never reveals its counties; the state must be selected, and a
     selected state anywhere in view wins (clamping can push it off center,
     and Nevada must never show California's counties). */
  const zoomedState = useMemo(() => {
    if (vb[2] > SUB_VB) return null;
    const inView = (b: number[]) =>
      !(b[2] < vb[0] || b[0] > vb[0] + vb[2] || b[3] < vb[1] || b[1] > vb[1] + vb[3]);
    return (
      US_STATES.find(
        (s) =>
          (selectedStateAbbrs.has(s.abbr) || s.abbr === primaryStateAbbr) &&
          inView(s.bounds)
      )?.abbr ?? null
    );
  }, [vb, selectedStateAbbrs, primaryStateAbbr]);

  const hasCouncil = (councilDistricts?.length ?? 0) > 0;
  const outlineDistricts = vb[2] < OUTLINE_VB && hasCouncil;
  const showDistricts = vb[2] < DISTRICT_VB && hasCouncil;

  useEffect(() => {
    if (!zoomedState) return;
    if (subLayer === "counties" && !counties) {
      fetch("/us-counties.json").then((r) => r.json()).then(setCounties).catch(() => {});
    }
    if (subLayer === "congressional" && !cds) {
      fetch("/us-cd.json").then((r) => r.json()).then(setCds).catch(() => {});
    }
  }, [zoomedState, counties, cds, subLayer]);
  useEffect(() => {
    if (
      (vb[2] < OUTLINE_VB * 2 || selectedRegions.some((r) => r.includes("-cc-"))) &&
      !council &&
      hasCouncil
    ) {
      fetch("/nyc-council.json").then((r) => r.json()).then(setCouncil).catch(() => {});
    }
  }, [vb, council, hasCouncil, selectedRegions]);

  // Non passive wheel listener: React's synthetic onWheel cannot
  // preventDefault, which is why the page scrolled instead of zooming.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (anim.current) {
        cancelAnimationFrame(anim.current);
        anim.current = null;
      }
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.18 : 0.85;
      const [x, y, w, h] = vbRef.current;
      const nw = Math.min(Math.max(w * factor, 1.5), FULL[2]);
      const nh = nw * RATIO;
      const cx = x + w * px;
      const cy = y + h * py;
      setVb(clampVb([cx - nw * px, cy - nh * py, nw, nh]));
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  // Search results and other outside controls hand the map a focus target.
  const focusKey = useRef<string | null>(null);
  useEffect(() => {
    if (!focus) {
      focusKey.current = null;
      return;
    }
    if (focusKey.current === focus.key) return;
    focusKey.current = focus.key;
    animateTo(fitBounds(focus.bounds, focus.pad ?? 0.25));
  }, [focus, animateTo]);

  // Arriving with a selection in the URL carries the camera to it.
  const autoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!primary) {
      autoKey.current = null;
      return;
    }
    if (autoKey.current === primary) return;
    autoKey.current = primary;
    if (vbRef.current[2] < FULL[2] * 0.9) return;
    if (primary.includes("-cc-")) return; // council effect below handles the city
    const st = US_STATES.find((s) => s.abbr === primaryStateAbbr);
    if (st) animateTo(fitBounds(st.bounds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary]);

  const autoCouncil = useRef<string | null>(null);
  useEffect(() => {
    const cc = selectedRegions.find((r) => r.includes("-cc-"));
    if (!cc) {
      autoCouncil.current = null;
      return;
    }
    if (!council || autoCouncil.current === cc) return;
    autoCouncil.current = cc;
    if (vbRef.current[2] >= DISTRICT_VB) {
      const xs = council.map((c) => c.centroid[0]);
      const ys = council.map((c) => c.centroid[1]);
      animateTo(
        fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 0.2)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegions, council]);

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
    setVb(([x, y, w, h]) => clampVb([x - dx, y - dy, w, h]));
  };
  const wasDrag = () => Boolean(drag.current?.moved);
  const onPointerUp = () => {
    setTimeout(() => (drag.current = null), 0);
  };

  const toggleRegion = (id: string, additive: boolean) => {
    if (additive) {
      const next = new Set(selectedRegions);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectRegions([...next]);
    } else {
      onSelectRegions(selected.has(id) && selectedRegions.length === 1 ? [] : [id]);
    }
  };

  const clickState = (abbr: string, e: React.MouseEvent) => {
    if (wasDrag()) return;
    const id = abbr.toLowerCase();
    const additive = e.metaKey || e.ctrlKey;
    toggleRegion(id, additive);
    if (!additive) {
      const st = US_STATES.find((s) => s.abbr === abbr)!;
      animateTo(fitBounds(st.bounds));
    }
  };

  // Labels rescale continuously with zoom and carry a white halo.
  const stateLabel = Math.min(Math.max(vb[2] / 28, 0.5), 32);
  const districtLabelSize = Math.max(vb[2] / 38, 0.35);

  const smallLabels = useMemo(() => {
    const smalls = US_STATES.filter((s) => SMALL_STATES.has(s.abbr)).sort(
      (a, b) => a.centroid[1] - b.centroid[1]
    );
    return smalls.map((s, i) => ({
      abbr: s.abbr,
      from: s.centroid,
      to: [918, 150 + i * 44] as [number, number],
    }));
  }, []);

  const councilCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of councilDistricts ?? []) m.set(d.id, d.n);
    return m;
  }, [councilDistricts]);
  const councilMax = Math.max(1, ...[...councilCounts.values()]);

  /* Breadcrumb: United States > State > County or district */
  const crumbState = primaryStateAbbr
    ? US_STATES.find((s) => s.abbr === primaryStateAbbr) ?? null
    : null;
  const crumbSub =
    primary && (primary.includes("-co-") || primary.includes("-cc-") || primary.includes("-cd-") || primary === "nyc")
      ? primary
      : null;
  const crumbBtn =
    "rounded border border-border bg-white px-2 py-0.5 text-brand-800 hover:bg-brand-50";

  const subShapes: { id: string; d: string; name: string }[] = useMemo(() => {
    if (!zoomedState) return [];
    const stLower = zoomedState.toLowerCase();
    if (subLayer === "congressional") {
      return (cds?.[zoomedState] ?? []).map((c) => ({
        id: `${stLower}-cd-${c.num}`,
        d: c.d,
        name: `${zoomedState}-${c.num}`,
      }));
    }
    return (counties?.[zoomedState] ?? []).map((c) => ({
      id: `${stLower}-co-${countySlug(c.name)}`,
      d: c.d,
      name: `${c.name} County`,
    }));
  }, [zoomedState, subLayer, cds, counties]);

  const subMax = useMemo(
    () =>
      Math.max(1, ...subShapes.map((s) => countyCounts?.[s.id] ?? 0)),
    [subShapes, countyCounts]
  );

  /* City labels, Apple Maps style: bigger cities appear first and smaller
     ones surface as you zoom, greedily decluttered so labels never pile up.
     US_CITIES is sorted by population descending. */
  const cityLabels = useMemo(() => {
    if (vb[2] > 640) return [];
    const minPop = vb[2] * 1300;
    const kept: typeof US_CITIES = [];
    const dx = vb[2] * 0.085;
    const dy = vb[2] * 0.032;
    for (const c of US_CITIES) {
      if (c.pop < minPop) continue;
      if (
        c.x < vb[0] - 5 || c.x > vb[0] + vb[2] + 5 ||
        c.y < vb[1] - 5 || c.y > vb[1] + vb[3] + 5
      )
        continue;
      if (kept.some((k) => Math.abs(k.x - c.x) < dx && Math.abs(k.y - c.y) < dy))
        continue;
      kept.push(c);
      if (kept.length >= 16) break;
    }
    return kept;
  }, [vb]);
  const citySize = Math.min(Math.max(vb[2] / 38, 0.3), 15);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <button
          type="button"
          className={crumbBtn}
          onClick={() => {
            onSelectRegions([]);
            animateTo(FULL);
          }}
        >
          United States
        </button>
        {crumbState && (
          <>
            <span className="text-muted">›</span>
            <button
              type="button"
              className={crumbBtn}
              onClick={() => {
                onSelectRegions([crumbState.abbr.toLowerCase()]);
                animateTo(fitBounds(crumbState.bounds));
              }}
            >
              {crumbState.name}
            </button>
          </>
        )}
        {crumbSub && (
          <>
            <span className="text-muted">›</span>
            <span className="rounded bg-brand-600 px-2 py-0.5 font-medium text-white">
              {districtLabel(crumbSub)}
            </span>
          </>
        )}
        {selectedRegions.length > 1 && (
          <span className="text-muted">+{selectedRegions.length - 1} more</span>
        )}
        <span className="ml-auto text-muted">
          click to select, cmd click for multiple, scroll to zoom
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
        {US_STATES.map((s) => {
          const isSel = selectedStateAbbrs.has(s.abbr);
          return (
            <path
              key={s.abbr}
              d={s.d}
              fill={fill(s.abbr)}
              fillOpacity={selectedRegions.length > 0 && !isSel ? 0.45 : 1}
              stroke={isSel ? "var(--brand-900)" : "#5b5470"}
              strokeWidth={isSel ? 2.5 : 1}
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer transition-opacity hover:opacity-85"
              pointerEvents={showDistricts ? "none" : "auto"}
              onClick={(e) => clickState(s.abbr, e)}
            >
              <title>{`${s.name}: ${(counts[s.abbr] ?? 0).toLocaleString("en-US")} ${legend}`}</title>
            </path>
          );
        })}

        {/* Counties or congressional districts on top of the focused state,
            shaded by volume; one click selects, cmd click multi selects */}
        {zoomedState && !showDistricts &&
          subShapes.map((c) => {
            const n = countyCounts?.[c.id] ?? 0;
            const isSel = selected.has(c.id);
            // Log scale: one giant county must not wash out all the others
            const t = n === 0 ? 0 : Math.log(1 + n) / Math.log(1 + subMax);
            return (
              <path
                key={c.id}
                d={c.d}
                fill={
                  isSel
                    ? "var(--brand-800)"
                    : n === 0
                      ? "white"
                      : t > 0.6
                        ? "var(--brand-600)"
                        : t > 0.25
                          ? "var(--brand-400)"
                          : "var(--brand-200)"
                }
                fillOpacity={isSel ? 0.95 : 0.75}
                stroke={isSel ? "var(--brand-900)" : "#5b5470"}
                strokeWidth={isSel ? 2.5 : 1}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer hover:opacity-80"
                onClick={(e) => {
                  e.stopPropagation();
                  if (wasDrag()) return;
                  toggleRegion(c.id, e.metaKey || e.ctrlKey);
                }}
              >
                <title>{`${c.name}: ${n.toLocaleString("en-US")} ${legend} (click to select)`}</title>
              </path>
            );
          })}

        {/* Council boundaries fade in while zooming toward the city and
            become clickable at close zoom: one continuous map */}
        {outlineDistricts &&
          (council ?? []).map((c) => {
            const id = `nyc-cc-${c.num}`;
            const isSel = selected.has(id);
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
                strokeWidth={isSel ? 3 : showDistricts ? 1.25 : 0.6}
                vectorEffect="non-scaling-stroke"
                pointerEvents={showDistricts ? "auto" : "none"}
                className={showDistricts ? "cursor-pointer hover:opacity-85" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (wasDrag()) return;
                  toggleRegion(id, e.metaKey || e.ctrlKey);
                }}
              >
                <title>{`Council District ${c.num}: ${n.toLocaleString("en-US")} ${legend} (click to select)`}</title>
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

        {/* City dots and names, on top of geography, never interactive */}
        {cityLabels.map((c) => (
          <g key={`${c.st}-${c.name}`} className="pointer-events-none select-none">
            <circle
              cx={c.x}
              cy={c.y}
              r={citySize / 4.5}
              fill="#3f3a4d"
              stroke="white"
              strokeWidth={citySize / 14}
            />
            <text
              x={c.x + citySize / 2.6}
              y={c.y}
              dominantBaseline="middle"
              fontSize={citySize}
              fontWeight={500}
              fill="#3f3a4d"
              stroke="white"
              strokeWidth={citySize / 7}
              paintOrder="stroke"
            >
              {c.name}
            </text>
          </g>
        ))}

        {/* State abbreviations: halo + continuous rescale. Small states use
            leader lines at national zoom; once zoomed in, their labels render
            in place at a reduced size so they never disappear */}
        {!showDistricts &&
          US_STATES.filter(
            (s) => !SMALL_STATES.has(s.abbr) || vb[2] <= 600
          ).map((s) => {
            const size = SMALL_STATES.has(s.abbr) ? stateLabel * 0.55 : stateLabel;
            return (
              <text
                key={s.abbr}
                x={s.centroid[0]}
                y={s.centroid[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                fontSize={size}
                fontWeight={700}
                fill="var(--brand-900)"
                stroke="white"
                strokeWidth={size / 5.5}
                paintOrder="stroke"
              >
                {s.abbr}
              </text>
            );
          })}
        {vb[2] > 600 &&
          smallLabels.map((l) => (
            <g
              key={l.abbr}
              className="cursor-pointer"
              onClick={(e) => clickState(l.abbr, e)}
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
                x={l.to[0] + 5}
                y={l.to[1]}
                dominantBaseline="middle"
                fontSize={24}
                fontWeight={700}
                fill="var(--brand-900)"
                stroke="white"
                strokeWidth={3.6}
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
