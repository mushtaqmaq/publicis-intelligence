import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function RateCardsPage() {
  await requireMediaUser("settings");
  const versions = await prisma.rateCardVersion.findMany({
    select: {
      id: true,
      versionLabel: true,
      rateYear: true,
      originalFilename: true,
      storageUrl: true,
      status: true,
      assetsExtracted: true,
      createdAt: true,
      rateCard: { select: { title: true, supplier: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Settings"
        title="Rate Cards"
        subtitle="Every uploaded rate-card document and its ingestion status."
        actions={
          <Link
            href="/media/settings/import-rate-card"
            className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium"
          >
            + Upload Rate Card
          </Link>
        }
      />

      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Supplier</th>
            <th className="py-2 pr-4 font-medium">Title</th>
            <th className="py-2 pr-4 font-medium">Year</th>
            <th className="py-2 pr-4 font-medium">Version</th>
            <th className="py-2 pr-4 font-medium">File</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium text-right">Assets extracted</th>
            <th className="py-2 pr-4 font-medium">Uploaded</th>
            <th className="py-2 pr-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} className="border-b border-border">
              <td className="py-2 pr-4">
                {v.rateCard.supplier.name === "__EXCEL_MIGRATION__"
                  ? "System (multi-supplier Excel migration)"
                  : v.rateCard.supplier.name}
              </td>
              <td className="py-2 pr-4">{v.rateCard.title}</td>
              <td className="py-2 pr-4">{v.rateYear}</td>
              <td className="py-2 pr-4">{v.versionLabel}</td>
              <td className="py-2 pr-4 font-mono text-xs">
                {v.storageUrl.startsWith("http") ? (
                  <a href={`/api/rate-cards/${v.id}/file`} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                    {v.originalFilename}
                  </a>
                ) : (
                  v.originalFilename
                )}
              </td>
              <td className="py-2 pr-4">
                <StatusChip status={v.status} />
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{v.assetsExtracted || "—"}</td>
              <td className="py-2 pr-4 text-muted">{v.createdAt.toLocaleDateString()}</td>
              <td className="py-2 pr-4 text-right">
                {v.status === "REVIEW" && (
                  <Link href={`/media/settings/rate-cards/${v.id}/review`} className="text-accent underline text-xs">
                    Review →
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {versions.length === 0 && (
        <div className="text-center text-muted text-sm py-16">
          No rate cards ingested yet.
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PUBLISHED: "bg-emerald-50 text-[var(--success)] border-emerald-200",
    UPLOADED: "bg-gray-50 text-gray-700 border-gray-200",
    PARSING: "bg-blue-50 text-blue-700 border-blue-200",
    PARSED: "bg-blue-50 text-blue-700 border-blue-200",
    REVIEW: "bg-amber-50 text-[var(--warning)] border-amber-200",
    ARCHIVED: "bg-gray-50 text-gray-500 border-gray-200",
    FAILED: "bg-red-50 text-[var(--danger)] border-red-200",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}
