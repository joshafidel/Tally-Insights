import { Suppressed } from "@/components/Sample";
import { formatN } from "@/lib/format";

export type BreakdownBar = {
  key: string;
  label: string;
  avg: number | null;
  n: number;
  color: string;
};

/*
  Horizontal mean-sentiment bars for demographic breakdowns. Server rendered.
  The bar length maps the 1 to 5 scale onto the track; identity is carried by
  the row label, with color used only where it has meaning (party affiliation).
  Every row shows its sample size. Suppressed rows say so instead of a number.
*/
export function BreakdownBars({ rows }: { rows: BreakdownBar[] }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-sm">{r.label}</div>
          <div className="relative h-3 flex-1 rounded-[4px] bg-brand-50">
            {r.avg != null && (
              <div
                className="absolute inset-y-0 left-0 rounded-[4px]"
                style={{
                  width: `${((r.avg - 1) / 4) * 100}%`,
                  backgroundColor: r.color,
                }}
              />
            )}
            <div
              className="absolute inset-y-[-2px] w-px bg-brand-200"
              style={{ left: "50%" }}
              title="Neutral (3)"
            />
          </div>
          <div className="w-36 shrink-0 text-right text-sm tabular-nums">
            {r.avg != null ? (
              <>
                <span className="font-medium">{r.avg.toFixed(2)}</span>{" "}
                <span className="text-xs text-muted">{formatN(r.n)}</span>
              </>
            ) : (
              <Suppressed n={r.n} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
