import { formatN } from "@/lib/format";

export function SampleSize({ n }: { n: number | null | undefined }) {
  return (
    <span className="whitespace-nowrap text-xs text-muted">{formatN(n)}</span>
  );
}

export function Suppressed({ n }: { n?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-muted">
      insufficient sample{n != null ? ` (n=${n})` : ""}
    </span>
  );
}
