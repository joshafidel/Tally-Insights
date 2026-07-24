import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAccess } from "@/lib/insights";
import { changeSeatRole, inviteSeat, removeSeat } from "./actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership) redirect("/");
  const { district } = await searchParams;
  const districtId = district ?? ctx.entitledDistricts[0]?.id ?? "nyc";
  const orgId = ctx.membership.orgId;
  const isAdmin = ["owner", "admin"].includes(ctx.membership.role);
  const isOwner = ctx.membership.role === "owner";

  const supabase = await createClient();
  const [{ data: members }, { data: log }] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, role, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    isAdmin
      ? supabase
          .from("access_log")
          .select("*")
          .eq("org_id", orgId)
          .order("at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  await logAccess(orgId, ctx.user.id, "view", "admin");

  // Email lookup goes through the service client: auth user records are not
  // client readable, and only the email string reaches the page.
  const emailById = new Map<string, string>();
  if (isAdmin) {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of data?.users ?? []) emailById.set(u.id, u.email ?? u.id);
  }

  return (
    <AppShell ctx={ctx} districtId={districtId} active="Admin">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-900">
          Admin: {ctx.membership.orgName}
        </h1>
        <p className="text-sm text-muted">
          Seats, roles, and the audit trail.
          {!isAdmin && " Your viewer seat can see the roster but not change it."}
        </p>
      </div>

      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Seats ({members?.length ?? 0})
        </h2>
        {isAdmin && (
          <form action={inviteSeat} className="mb-4 flex flex-wrap gap-2">
            <input type="hidden" name="org_id" value={orgId} />
            <input
              type="email"
              name="email"
              required
              placeholder="colleague@organization.org"
              className="min-w-64 flex-1 rounded-md border border-border bg-white px-3 py-1.5 text-sm"
            />
            <select
              name="role"
              defaultValue="viewer"
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm"
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
              {isOwner && <option value="owner">Owner</option>}
            </select>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Invite
            </button>
          </form>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Member</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 pr-3 font-medium">Since</th>
              {isAdmin && <th className="py-2 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.user_id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">
                  {emailById.get(m.user_id) ?? m.user_id}
                  {m.user_id === ctx.user.id && (
                    <span className="ml-2 text-xs text-muted">(you)</span>
                  )}
                </td>
                <td className="py-2 pr-3 capitalize">{m.role}</td>
                <td className="py-2 pr-3">
                  {new Date(m.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                {isAdmin && (
                  <td className="py-2">
                    {m.user_id !== ctx.user.id && (
                      <div className="flex items-center gap-2">
                        <form action={changeSeatRole} className="flex items-center gap-1">
                          <input type="hidden" name="org_id" value={orgId} />
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <select
                            name="role"
                            defaultValue={m.role}
                            className="rounded border border-border bg-white px-1.5 py-0.5 text-xs"
                          >
                            <option value="viewer">viewer</option>
                            <option value="admin">admin</option>
                            {isOwner && <option value="owner">owner</option>}
                          </select>
                          <button className="text-xs text-brand-700 hover:underline">
                            Set
                          </button>
                        </form>
                        <form action={removeSeat}>
                          <input type="hidden" name="org_id" value={orgId} />
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <button className="text-xs text-muted hover:text-brand-800 hover:underline">
                            Remove
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isAdmin && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Access log (latest 100)
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Who</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Resource</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(log ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-xs">
                    {new Date(row.at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">
                    {emailById.get(row.user_id) ?? row.user_id.slice(0, 8)}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">{row.action}</td>
                  <td className="py-1.5 pr-3 text-xs">{row.resource}</td>
                  <td className="max-w-[360px] truncate py-1.5 font-mono text-xs text-muted">
                    {row.detail ? JSON.stringify(row.detail) : ""}
                  </td>
                </tr>
              ))}
              {(log ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-sm text-muted">
                    No activity logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </AppShell>
  );
}
