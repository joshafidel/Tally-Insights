import Link from "next/link";
import type { OrgContext } from "@/lib/org";

const NAV = [
  { label: "Dashboard", href: () => `/dashboard` },
  { label: "Overview", href: (d: string) => `/districts/${d}` },
  { label: "Officials", href: (d: string) => `/districts/${d}/officials` },
  { label: "Watchlist and alerts", href: (d: string) => `/districts/${d}/watchlist` },
  { label: "Methodology", href: (d: string) => `/methodology?district=${d}` },
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
      <header className="sticky top-0 z-10 border-b border-brand-200 bg-gradient-to-r from-brand-50 via-card to-brand-50/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-bold text-white shadow-sm">
                T
              </span>
              <span className="text-lg font-semibold tracking-tight text-brand-900">
                Tally <span className="font-normal text-brand-600">Insights</span>
              </span>
            </Link>
            <nav className="hidden items-center gap-5 md:flex">
              {NAV.map((item) => (
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
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {ctx.entitledDistricts.length > 1 && (
              <div className="hidden items-center gap-1 rounded-md border border-border bg-white p-0.5 md:flex">
                {ctx.entitledDistricts.map((d) => (
                  <Link
                    key={d.id}
                    href={`/districts/${d.id}`}
                    className={
                      d.id === districtId
                        ? "rounded bg-brand-100 px-2 py-1 text-xs font-medium text-brand-800"
                        : "rounded px-2 py-1 text-xs text-muted hover:bg-brand-50"
                    }
                  >
                    {d.name}
                  </Link>
                ))}
              </div>
            )}
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
