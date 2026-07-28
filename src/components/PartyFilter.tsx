import Link from "next/link";

/*
  Link based segmented control: server rendered, no client JS. Party colors
  are allowed here because the segments represent party affiliation itself.
*/
const OPTIONS = [
  { key: "all", label: "All voters", color: "var(--brand-600)" },
  { key: "D", label: "Democrats", color: "var(--party-d)" },
  { key: "R", label: "Republicans", color: "var(--party-r)" },
  { key: "I", label: "Independents", color: "var(--party-i)" },
];

export function PartyFilter({
  basePath,
  current,
}: {
  basePath: string;
  current: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white p-1 shadow-sm">
      {OPTIONS.map((o) => {
        const active = current === o.key;
        return (
          <Link
            key={o.key}
            href={o.key === "all" ? basePath : `${basePath}?party=${o.key}`}
            className={
              active
                ? "rounded-md px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md px-3 py-1.5 text-sm text-muted hover:bg-brand-50"
            }
            style={active ? { backgroundColor: o.color } : undefined}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
