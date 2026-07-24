import Link from "next/link";
import type { OrgContext } from "@/lib/org";

const NAV = [
  { label: "Overview", href: (d: string) => `/districts/${d}`, built: true },
  { label: "Officials", href: (d: string) => `/districts/${d}/officials`, built: false },
  { label: "Watchlist and alerts", href: (d: string) => `/districts/${d}/watchlist`, built: false },
  { label: "Methodology", href: () => `/methodology`, built: false },
  { label: "Admin", href: () => `/admin`, built: false },
];

export function AppShell({
  ctx,
  districtId,
  active,
  children,
}: {
  ctx: OrgContext;
  districtId: string;
  active: string;
  children: React.ReactNode;
}) {
  const district = ctx.entitledDistricts.find((d) => d.id === districtId);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-lg font-semibold text-brand-800">
              Tally Insights
            </Link>
            <nav className="hidden items-center gap-5 md:flex">
              {NAV.map((item) =>
                item.built ? (
                  <Link
                    key={item.label}
                    href={item.href(districtId)}
                    className={
                      active === item.label
                        ? "border-b-2 border-brand-600 pb-0.5 text-sm font-medium text-brand-800"
                        : "text-sm text-muted hover:text-brand-700"
                    }
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    key={item.label}
                    className="cursor-default text-sm text-muted/60"
                    title="Arrives in a later checkpoint"
                  >
                    {item.label}
                  </span>
                )
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{ctx.membership?.orgName}</div>
              <div className="text-xs text-muted">
                {district ? `${district.name} (${district.state})` : ""}
              </div>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-brand-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] px-6 py-6">{children}</main>
    </div>
  );
}
