import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { hasPermission } from "@/lib/auth/permissions";
import { assignAccountManagerAction, createClientAction, setClientDepartmentsAction } from "./actions";
import { DEPARTMENTS } from "@/lib/core/clients";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireMediaUser("clients");
  const canManageAll = await hasPermission(user, "clients.manage_all");

  // An Account Manager without clients.manage_all only ever sees their own
  // assigned clients — enforced here at the query level, not by filtering a
  // fetched-all list in the browser.
  const where = canManageAll ? {} : { accountManagerId: user.id };

  const [clients, accountManagers] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { mediaPlans: true } }, accountManager: { select: { id: true, name: true, email: true } } },
    }),
    canManageAll
      ? prisma.user.findMany({
          where: { role: { in: ["ACCOUNT_MANAGER", "ADMIN", "SUPER_ADMIN"] }, isActive: true },
          select: { id: true, name: true, email: true },
          orderBy: { email: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title={canManageAll ? "Clients" : "My Clients"} subtitle={`${clients.length} client${clients.length === 1 ? "" : "s"}.`} />

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>}
      {canManageAll && (
        <form action={createClientAction} className="mt-6 flex flex-wrap items-end gap-3 bg-surface border border-border rounded-lg p-4">
          <div><label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">New client</label><input name="name" required maxLength={200} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" /></div>
          <div className="flex flex-wrap items-center gap-3 pb-1.5">{DEPARTMENTS.map((d) => <label key={d.id} className="inline-flex items-center gap-1 text-xs"><input type="checkbox" name="departments" value={d.id} />{d.label}</label>)}</div>
          <button type="submit" className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">Add client</button>
        </form>
      )}
      <p className="text-xs text-muted mt-3">One client list for the whole platform. Tick the departments that handle each client; Media, Creative and the others only offer the clients they handle.</p>
      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Client</th>
            <th className="py-2 pr-4 font-medium text-right">Media plans</th>
            <th className="py-2 pr-4 font-medium">Currency</th>
            <th className="py-2 pr-4 font-medium">Handled by</th>
            <th className="py-2 pr-4 font-medium">Account Manager</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id} className="border-b border-border">
              <td className="py-2 pr-4 font-medium text-foreground">{c.name}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{c._count.mediaPlans}</td>
              <td className="py-2 pr-4 text-muted">{c.currency}</td>
              <td className="py-2 pr-4">
                {canManageAll ? (
                  <form action={setClientDepartmentsAction} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <input type="hidden" name="clientId" value={c.id} />
                    {DEPARTMENTS.map((d) => (
                      <label key={d.id} className="inline-flex items-center gap-1 text-xs"><input type="checkbox" name="departments" value={d.id} defaultChecked={c.departments.includes(d.id)} />{d.label}</label>
                    ))}
                    <button type="submit" className="text-xs text-accent underline">Save</button>
                  </form>
                ) : (
                  <span className="text-muted text-xs">{DEPARTMENTS.filter((d) => c.departments.includes(d.id)).map((d) => d.label).join(", ") || "—"}</span>
                )}
              </td>
              <td className="py-2 pr-4">
                {canManageAll ? (
                  <form action={assignAccountManagerAction} className="inline-flex items-center gap-1.5">
                    <input type="hidden" name="clientId" value={c.id} />
                    <select name="accountManagerId" defaultValue={c.accountManagerId ?? ""} className="text-xs rounded border border-border bg-background px-1.5 py-0.5">
                      <option value="">Unassigned</option>
                      {accountManagers.map((am) => (
                        <option key={am.id} value={am.id}>
                          {am.name ?? am.email}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs text-accent underline">
                      Save
                    </button>
                  </form>
                ) : (
                  <span className="text-muted">{c.accountManager?.name ?? c.accountManager?.email ?? "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {clients.length === 0 && <p className="text-sm text-muted mt-6">No clients assigned to you yet.</p>}
    </div>
  );
}
