import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { hasPermission } from "@/lib/auth/permissions";
import { assignAccountManagerAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requireMediaUser();
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
    <div className="p-8 max-w-5xl">
      <PageHeader title={canManageAll ? "Clients" : "My Clients"} subtitle={`${clients.length} client${clients.length === 1 ? "" : "s"}.`} />

      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Client</th>
            <th className="py-2 pr-4 font-medium text-right">Media plans</th>
            <th className="py-2 pr-4 font-medium">Currency</th>
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
