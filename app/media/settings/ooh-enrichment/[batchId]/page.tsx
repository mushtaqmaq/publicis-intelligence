import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findAssetMatches } from "@/lib/ingestion/matching";
import type { OohEnrichmentRow } from "@/lib/ingestion/oohEnrichmentRow";
import { enrichmentRowKey } from "@/lib/ingestion/oohEnrichmentRow";
import { assignToExistingAction, createNewAssetAction, dismissRowAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

function fmtPrices(prices: Record<string, number>) {
  return Object.entries(prices ?? {})
    .map(([k, v]) => `${k.replace("_", " ")}: QAR ${v.toLocaleString()}`)
    .join(" · ");
}

export default async function OohEnrichmentReviewPage({ params }: { params: Promise<{ batchId: string }> }) {
  await requireMediaUser();
  const { batchId } = await params;

  const batch = await prisma.oohEnrichmentBatch.findUnique({ where: { id: batchId } });
  if (!batch) notFound();

  const allPending = (batch.pending as unknown as OohEnrichmentRow[]) ?? [];
  const pending = allPending.filter((r) => !batch.resolved.includes(enrichmentRowKey(r)));

  const supplierNames = Array.from(new Set(pending.map((r) => r.dbSupplier))).sort();
  const assetsBySupplier = new Map<
    string,
    Array<{ id: string; assetName: string; locationName: string; area: string | null }>
  >();
  for (const name of supplierNames) {
    const assets = await prisma.asset.findMany({
      where: { supplier: { name } },
      select: { id: true, assetName: true, locationName: true, area: true },
      orderBy: [{ assetName: "asc" }, { area: "asc" }],
    });
    assetsBySupplier.set(name, assets);
  }

  const bySupplier = new Map<string, OohEnrichmentRow[]>();
  for (const r of pending) {
    if (!bySupplier.has(r.dbSupplier)) bySupplier.set(r.dbSupplier, []);
    bySupplier.get(r.dbSupplier)!.push(r);
  }

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/media/settings/ooh-enrichment" className="text-sm text-accent underline">
        ← Back to Enrichment Batches
      </Link>
      <div className="mt-3">
        <PageHeader
          title={`Review: ${batch.sourceLabel}`}
          subtitle={
            <>
              {pending.length} row(s) still need a decision ({allPending.length - pending.length} already resolved
              this session). Each row carries real coordinates, footfall/impressions/OTS, and/or pricing that
              didn&apos;t confidently match an existing asset. Assign it to the right existing asset, create it as
              a new asset, or dismiss it — nothing is guessed automatically.
            </>
          }
        />
      </div>

      {pending.length === 0 && <p className="text-sm text-muted mt-6">Everything in this batch has been resolved.</p>}

      {Array.from(bySupplier.entries()).map(([supplierName, rows]) => {
        const assets = assetsBySupplier.get(supplierName) ?? [];
        const matchable = assets.map((a) => ({ id: a.id, assetName: a.assetName, locationName: a.locationName, area: a.area }));

        return (
          <section key={supplierName} className="mt-8">
            <h2 className="text-sm font-medium text-foreground mb-3">
              {supplierName} ({rows.length} row{rows.length === 1 ? "" : "s"})
            </h2>
            <div className="space-y-3">
              {rows.map((row) => {
                const rowKey = enrichmentRowKey(row);
                const suggestions = findAssetMatches(row.assetName, row.area, matchable).slice(0, 3);
                return (
                  <div key={rowKey} className="bg-surface border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{row.assetName}</span>
                      <span className="text-xs text-muted">
                        {row.environment} · {row.format}
                        {row.subFormat ? ` · ${row.subFormat}` : ""}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {row.lat !== null && row.lon !== null && (
                        <span>
                          {row.lat.toFixed(5)}, {row.lon.toFixed(5)}
                          {"  ·  "}
                        </span>
                      )}
                      {row.footfall && <span>Footfall: {row.footfall.toLocaleString()} ({row.footfallPeriod})  ·  </span>}
                      {row.impressions && <span>Impressions: {row.impressions.toLocaleString()} ({row.impressionPeriod})  ·  </span>}
                      {row.ots && <span>OTS: {row.ots.toLocaleString()}  ·  </span>}
                      {Object.keys(row.prices ?? {}).length > 0 && <span>{fmtPrices(row.prices)}</span>}
                    </p>
                    {row.origSupplierDesc && (
                      <p className="text-xs text-muted mt-1 italic">&ldquo;{row.origSupplierDesc}&rdquo;</p>
                    )}

                    {suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {suggestions.map((s) => {
                          const full = assets.find((a) => a.id === s.asset.id)!;
                          return (
                            <form action={assignToExistingAction} key={s.asset.id}>
                              <input type="hidden" name="batchId" value={batchId} />
                              <input type="hidden" name="rowKey" value={rowKey} />
                              <input type="hidden" name="assetId" value={s.asset.id} />
                              <SubmitButton
                                pendingText="Assigning…"
                                className="text-xs px-2 py-1 rounded border border-border hover:border-accent hover:text-accent"
                              >
                                {full.assetName} — {full.area ?? full.locationName} ({Math.round(s.score * 100)}%)
                              </SubmitButton>
                            </form>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <form action={assignToExistingAction} className="flex items-center gap-2">
                        <input type="hidden" name="batchId" value={batchId} />
                        <input type="hidden" name="rowKey" value={rowKey} />
                        <select name="assetId" required className="text-sm rounded border border-border bg-background px-2 py-1 max-w-xs">
                          <option value="">Or search {supplierName}&apos;s assets…</option>
                          {assets.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.assetName} — {a.area ?? a.locationName}
                            </option>
                          ))}
                        </select>
                        <SubmitButton pendingText="Assigning…" className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground font-medium">
                          Assign
                        </SubmitButton>
                      </form>
                      <form action={createNewAssetAction}>
                        <input type="hidden" name="batchId" value={batchId} />
                        <input type="hidden" name="rowKey" value={rowKey} />
                        <SubmitButton pendingText="Creating…" className="text-xs px-2 py-1 rounded border border-border text-foreground">
                          Create as new asset
                        </SubmitButton>
                      </form>
                      <form action={dismissRowAction}>
                        <input type="hidden" name="batchId" value={batchId} />
                        <input type="hidden" name="rowKey" value={rowKey} />
                        <SubmitButton pendingText="Dismissing…" className="text-xs px-2 py-1 rounded border border-border text-muted">
                          Dismiss
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
