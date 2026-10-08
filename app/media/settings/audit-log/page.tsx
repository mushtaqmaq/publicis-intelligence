import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

function summarizeValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
      .join(", ");
  }
  return String(v);
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string }>;
}) {
  await requireMediaUser("settings");
  const { entityType } = await searchParams;

  const [logs, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true } }),
  ]);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Settings"
        title="Audit Log"
        subtitle="Every rate-card publish/reject, plan status change, asset edit, and user-management action, newest first. Showing up to 200 rows."
        actions={
          <form className="flex items-center gap-2">
            <select
              name="entityType"
              defaultValue={entityType ?? ""}
              className="text-sm rounded-md border border-border bg-background px-2 py-1.5"
            >
              <option value="">All entity types</option>
              {entityTypes.map((t) => (
                <option key={t.entityType} value={t.entityType}>
                  {t.entityType}
                </option>
              ))}
            </select>
            <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-accent text-accent-foreground font-medium">
              Filter
            </button>
          </form>
        }
      />

      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">User</th>
            <th className="py-2 pr-4 font-medium">Action</th>
            <th className="py-2 pr-4 font-medium">Entity</th>
            <th className="py-2 pr-4 font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-border align-top">
              <td className="py-2 pr-4 text-xs text-muted whitespace-nowrap">
                {log.createdAt.toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-xs">{log.user ? log.user.name ?? log.user.email : "System"}</td>
              <td className="py-2 pr-4">
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200">
                  {log.action}
                </span>
              </td>
              <td className="py-2 pr-4 text-xs text-muted">
                {log.entityType}
                {log.entityId ? ` · ${log.entityId.slice(0, 12)}…` : ""}
              </td>
              <td className="py-2 pr-4 text-xs text-muted max-w-md">
                {log.oldValue && <div>from: {summarizeValue(log.oldValue)}</div>}
                {log.newValue && <div>to: {summarizeValue(log.newValue)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <p className="text-sm text-muted mt-6">No audit log entries yet.</p>}
    </div>
  );
}
