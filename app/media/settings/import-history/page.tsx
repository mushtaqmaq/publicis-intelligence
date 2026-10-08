import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  QUEUED: "bg-gray-50 text-gray-600 border-gray-200",
  FAILED: "bg-red-50 text-[var(--danger)] border-red-200",
};

export default async function ImportHistoryPage() {
  await requireMediaUser("settings");
  const jobs = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      triggeredBy: { select: { name: true, email: true } },
      rateCardVersion: {
        select: { originalFilename: true, rateCard: { select: { supplier: { select: { name: true } } } } },
      },
    },
  });

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Settings"
        title="Import History"
        subtitle="Every ImportJob record — the original Excel migration plus every rate-card upload processed through Settings → Import Rate Card since."
      />

      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Source</th>
            <th className="py-2 pr-4 font-medium">Supplier / File</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium text-right">Assets</th>
            <th className="py-2 pr-4 font-medium text-right">Suppliers</th>
            <th className="py-2 pr-4 font-medium text-right">Rates</th>
            <th className="py-2 pr-4 font-medium text-right">Fees</th>
            <th className="py-2 pr-4 font-medium text-right">Conflicts</th>
            <th className="py-2 pr-4 font-medium">Triggered by</th>
            <th className="py-2 pr-4 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-border align-top">
              <td className="py-2 pr-4 text-muted">{job.sourceType.replace(/_/g, " ")}</td>
              <td className="py-2 pr-4">
                {job.rateCardVersion ? (
                  <>
                    <div className="text-foreground">{job.rateCardVersion.rateCard.supplier.name}</div>
                    <div className="text-xs text-muted font-mono">{job.rateCardVersion.originalFilename}</div>
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="py-2 pr-4">
                <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_STYLE[job.status] ?? ""}`}>
                  {job.status}
                </span>
                {job.errorMessage && (
                  <div className="text-xs text-[var(--danger)] mt-1 max-w-xs">{job.errorMessage}</div>
                )}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{job.assetsFound || "—"}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{job.suppliersFound || "—"}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{job.ratesImported || "—"}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{job.feesImported || "—"}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {job.conflictsFound > 0 ? (
                  <span className="text-[var(--warning)]">{job.conflictsFound}</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2 pr-4 text-muted">
                {job.triggeredBy?.name ?? job.triggeredBy?.email ?? "System"}
              </td>
              <td className="py-2 pr-4 text-muted">{job.createdAt.toLocaleString()}</td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={10} className="py-6 text-center text-muted">
                No import jobs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
