import { SENTIMENT_RAMP } from "@/lib/format";

/*
  Compact 1 to 5 distribution strip for table rows. Pure divs so it renders
  on the server. Segments use the sentiment ramp with 2px gaps; identity is
  carried by position (1 left, 5 right) and the tooltip title.
*/
export function DistBar({
  distribution,
  className = "",
}: {
  distribution: number[] | null;
  className?: string;
}) {
  if (!distribution) return null;
  const total = distribution.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div
      className={`flex h-2.5 w-32 items-stretch gap-[2px] ${className}`}
      title={distribution
        .map((c, i) => `${i + 1}: ${c} (${Math.round((c / total) * 100)}%)`)
        .join("  ")}
    >
      {distribution.map((count, i) => (
        <div
          key={i}
          className="rounded-[2px]"
          style={{
            backgroundColor: SENTIMENT_RAMP[i],
            width: `${Math.max((count / total) * 100, 1)}%`,
          }}
        />
      ))}
    </div>
  );
}
