import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { OohEnrichmentRow } from "@/lib/ingestion/oohEnrichmentRow";
import { enrichmentRowKey } from "@/lib/ingestion/oohEnrichmentRow";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function OohEnrichmentBatchesPage() {
  await requireMediaUser("settings");
  const batches = await prisma.oohEnrichmentBatch.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Asset Enrichment Batches"
        subtitle={
          <>
            Rows imported from an external asset spreadsheet that carried real coordinates, audience metrics, or
            pricing but didn&apos;t confidently match an existing asset. Review each batch to assign, create, or
            dismiss its rows — nothing here was applied automatically.
          </>
        }
      />

      {batches.length === 0 && <p className="text-sm text-muted mt-6">No enrichment batches yet.</p>}

      <div className="space-y-3 mt-6">
        {batches.map((b) => {
          const all = (b.pending as unknown as OohEnrichmentRow[]) ?? [];
          const pendingCount = all.filter((r) => !b.resolved.includes(enrichmentRowKey(r))).length;
          return (
            <Link
              key={b.id}
              href={`/media/settings/ooh-enrichment/${b.id}`}
              className="block bg-surface border border-border rounded-lg p-4 hover:border-accent"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground text-sm">{b.sourceLabel}</span>
                <span className="text-xs text-muted">{b.createdAt.toLocaleDateString()}</span>
              </div>
              <p className="text-xs text-muted mt-1">
                {pendingCount} of {all.length} row(s) still pending
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
