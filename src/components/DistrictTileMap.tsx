import { SENTIMENT_RAMP } from "@/lib/format";

/*
  District consensus map for one bill or topic: a tile per district, filled
  with the sentiment ramp (light = disagree, deep purple = agree), each tile
  carrying its mean and sample size. Server rendered, no external assets.
  Council sub districts appear alongside their city as their own tiles.
*/
export function DistrictTileMap({
  rows,
  rootDistrictName,
}: {
  rows: { district_id: string; n: number; avg_value: number | null }[];
  rootDistrictName: string;
}) {
  const label = (id: string) => {
    if (id.includes("-cc-")) return `Council ${id.split("-cc-")[1]}`;
    return rootDistrictName;
  };
  const fill = (avg: number | null) => {
    if (avg == null) return "var(--brand-50)";
    const idx = Math.min(4, Math.max(0, Math.round(avg) - 1));
    return SENTIMENT_RAMP[idx];
  };
  const ink = (avg: number | null) =>
    avg != null && avg >= 3.5 ? "white" : "var(--brand-900)";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <div
            key={r.district_id}
            className="flex h-24 w-28 flex-col justify-between rounded-lg p-2.5 shadow-sm"
            style={{ backgroundColor: fill(r.avg_value), color: ink(r.avg_value) }}
            title={`${label(r.district_id)}: mean ${r.avg_value ?? "n/a"} (n=${r.n})`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-90">
              {label(r.district_id)}
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums leading-none">
                {r.avg_value != null ? r.avg_value.toFixed(2) : "n/a"}
              </div>
              <div className="text-[11px] opacity-90">n={r.n}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span>Disagree</span>
        {SENTIMENT_RAMP.map((c) => (
          <span key={c} className="h-3 w-6 rounded-sm" style={{ backgroundColor: c }} />
        ))}
        <span>Agree</span>
      </div>
    </div>
  );
}
