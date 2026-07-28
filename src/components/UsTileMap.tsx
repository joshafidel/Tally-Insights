"use client";

/*
  NPR style state tile grid: a clickable US map with no external assets.
  Fill encodes how many officials match the current filters in each state
  (brand purple ramp: magnitude, not identity). The selected state gets a
  strong border. Party colors never appear here.
*/
const GRID: Record<string, [number, number]> = {
  AK: [0, 0], ME: [0, 10],
  VT: [1, 9], NH: [1, 10],
  WA: [2, 0], ID: [2, 1], MT: [2, 2], ND: [2, 3], MN: [2, 4], IL: [2, 5], WI: [2, 6], MI: [2, 7], NY: [2, 8], RI: [2, 9], MA: [2, 10],
  OR: [3, 0], NV: [3, 1], WY: [3, 2], SD: [3, 3], IA: [3, 4], IN: [3, 5], OH: [3, 6], PA: [3, 7], NJ: [3, 8], CT: [3, 9],
  CA: [4, 0], UT: [4, 1], CO: [4, 2], NE: [4, 3], MO: [4, 4], KY: [4, 5], WV: [4, 6], VA: [4, 7], MD: [4, 8], DE: [4, 9],
  AZ: [5, 1], NM: [5, 2], KS: [5, 3], AR: [5, 4], TN: [5, 5], NC: [5, 6], SC: [5, 7], DC: [5, 8],
  OK: [6, 3], LA: [6, 4], MS: [6, 5], AL: [6, 6], GA: [6, 7],
  HI: [7, 0], TX: [7, 3], FL: [7, 8],
};

export function UsTileMap({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (state: string | null) => void;
}) {
  const max = Math.max(1, ...Object.values(counts));
  const fill = (n: number) => {
    if (n === 0) return "var(--brand-50)";
    const t = n / max;
    if (t > 0.75) return "var(--brand-700)";
    if (t > 0.5) return "var(--brand-500)";
    if (t > 0.25) return "var(--brand-400)";
    return "var(--brand-300)";
  };

  return (
    <div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: "repeat(11, minmax(0, 1fr))",
          maxWidth: 460,
        }}
      >
        {Array.from({ length: 8 * 11 }).map((_, i) => {
          const row = Math.floor(i / 11);
          const col = i % 11;
          const state = Object.entries(GRID).find(
            ([, [r, c]]) => r === row && c === col
          )?.[0];
          if (!state) return <div key={i} />;
          const n = counts[state] ?? 0;
          const isSelected = selected === state;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(isSelected ? null : state)}
              title={`${state}: ${n} officials`}
              className="flex aspect-square items-center justify-center rounded text-[10px] font-semibold transition"
              style={{
                backgroundColor: fill(n),
                color: n / max > 0.5 && n > 0 ? "white" : "var(--brand-900)",
                outline: isSelected ? "2px solid var(--brand-900)" : "none",
                outlineOffset: 1,
              }}
            >
              {state}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span>Fewer</span>
        {["var(--brand-50)", "var(--brand-300)", "var(--brand-400)", "var(--brand-500)", "var(--brand-700)"].map(
          (c) => (
            <span key={c} className="h-3 w-6 rounded-sm" style={{ backgroundColor: c }} />
          )
        )}
        <span>More officials</span>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-2 text-brand-700 underline-offset-2 hover:underline"
          >
            Clear {selected}
          </button>
        )}
      </div>
    </div>
  );
}
