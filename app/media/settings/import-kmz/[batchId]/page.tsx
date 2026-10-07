import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findAssetMatches } from "@/lib/ingestion/matching";
import {
  assignPlacemarkAction,
  dismissPlacemarkAction,
  bulkAssignGroupAction,
  bulkDismissGroupAction,
} from "./actions";
import { detectPrefix } from "@/lib/geocoding/kmzPrefix";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

interface PendingPlacemark {
  name: string;
  lat: number;
  lon: number;
  reason: "no_confident_match" | "ambiguous_asset" | "duplicate_coords";
}

const REASON_LABEL: Record<PendingPlacemark["reason"], string> = {
  no_confident_match: "No confident match",
  ambiguous_asset: "Matched the same asset as another placemark",
  duplicate_coords: "Same name appears at different coordinates in the file",
};

function assetLabel(a: { assetName: string; locationName: string; area: string | null; supplier: { name: string } }) {
  const place = a.area && a.area !== a.locationName ? `${a.locationName}, ${a.area}` : a.locationName;
  return `${a.assetName} — ${place} (${a.supplier.name})`;
}

export default async function KmzReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ page?: string; prefix?: string }>;
}) {
  await requireMediaUser();
  const { batchId } = await params;
  const { page: pageParam, prefix: prefixParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const batch = await prisma.kmzImportBatch.findUnique({
    where: { id: batchId },
    include: { supplier: { select: { id: true, name: true } } },
  });
  if (!batch) notFound();

  const allPending = (batch.pending as unknown as PendingPlacemark[]) ?? [];
  const pending = allPending.filter((p) => !batch.resolved.includes(p.name));

  // KMZ placemarks are GPS points — only OOH assets can plausibly be a real
  // physical site. Combined-mode used to match against every asset in the
  // database regardless of channel, burying the relevant OOH options under
  // thousands of radio/print/digital line items that can never have a point.
  const assets = await prisma.asset.findMany({
    where: batch.supplierId ? { supplierId: batch.supplierId } : { supplier: { mediaChannel: "OOH" } },
    select: { id: true, assetName: true, locationName: true, area: true, supplier: { select: { name: true } } },
    orderBy: [{ assetName: "asc" }, { area: "asc" }],
  });
  const matchableAssets = assets.map((a) => ({ id: a.id, assetName: a.assetName, locationName: a.locationName, area: a.area }));

  // Group by shared code prefix (e.g. "SE-009", "SE-011" -> "SE") — a
  // supplier's own numbering usually maps many physical units to one or
  // more product-type assets (often one per area — Elan has a separate
  // "MUPIS" row for Doha, Al Rayyan, Al Wakrah, etc.), so a group is a
  // starting point for bulk-assign, not a guarantee it's all one asset.
  const byPrefix = new Map<string, PendingPlacemark[]>();
  for (const p of pending) {
    const prefix = detectPrefix(p.name);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(p);
  }

  // Drill-down mode: browsing one prefix's items individually, for groups
  // that clearly span more than one destination asset.
  if (prefixParam) {
    const items = (byPrefix.get(prefixParam) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const itemsPage = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
      <div className="p-8 max-w-5xl">
        <Link href={`/media/settings/import-kmz/${batchId}`} className="text-sm text-accent underline">
          ← Back to groups
        </Link>
        <div className="mt-3">
          <PageHeader
            title={`${prefixParam}-* — ${items.length} placemark${items.length === 1 ? "" : "s"}`}
            subtitle="Assign each individually when a group spans more than one destination asset (e.g. one per area)."
          />
        </div>

        <div className="space-y-3 mt-6">
          {itemsPage.map((p) => (
            <PlacemarkCard key={p.name} p={p} batchId={batchId} assets={assets} matchableAssets={matchableAssets} />
          ))}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-3 mt-4 text-sm">
            <span className="text-muted">
              Page {page} of {pageCount}
            </span>
            {page > 1 && (
              <Link href={`/media/settings/import-kmz/${batchId}?prefix=${encodeURIComponent(prefixParam)}&page=${page - 1}`} className="text-accent underline">
                Previous
              </Link>
            )}
            {page < pageCount && (
              <Link href={`/media/settings/import-kmz/${batchId}?prefix=${encodeURIComponent(prefixParam)}&page=${page + 1}`} className="text-accent underline">
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  const groups = Array.from(byPrefix.entries())
    .filter(([, items]) => items.length > 1)
    .sort((a, b) => b[1].length - a[1].length);
  const ungrouped = Array.from(byPrefix.entries())
    .filter(([, items]) => items.length === 1)
    .map(([, items]) => items[0])
    .sort((a, b) => a.name.localeCompare(b.name));
  const pageCount = Math.max(1, Math.ceil(ungrouped.length / PAGE_SIZE));
  const ungroupedPage = ungrouped.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/media/settings/import-kmz" className="text-sm text-accent underline">
        ← Back to Import KMZ
      </Link>
      <div className="mt-3">
        <PageHeader
          title={`Review: ${batch.filename} — ${batch.supplier?.name ?? "All suppliers (combined)"}`}
          subtitle={
            <>
              {pending.length} placemark(s) still need a decision ({allPending.length - pending.length} already
              resolved this session). Assigning a second point to an asset that already has one turns it into a
              multi-location asset automatically — nothing is overwritten. A group often maps to several
              destination assets (e.g. one per area) — check the sample names before bulk-assigning, or browse it
              individually.
            </>
          }
        />
      </div>

      {groups.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-foreground mb-3">
            Grouped by code prefix ({groups.length} group{groups.length === 1 ? "" : "s"})
          </h2>
          <div className="space-y-3">
            {groups.map(([prefix, items]) => (
              <div key={prefix} className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-medium text-foreground">{prefix}-*</span>
                    <span className="text-sm text-muted ml-2">{items.length} placemarks</span>
                  </div>
                  <Link
                    href={`/media/settings/import-kmz/${batchId}?prefix=${encodeURIComponent(prefix)}`}
                    className="text-xs text-accent underline"
                  >
                    Browse individually →
                  </Link>
                </div>
                <p className="text-xs text-muted mt-1 font-mono">
                  {items
                    .slice(0, 6)
                    .map((i) => i.name)
                    .join(", ")}
                  {items.length > 6 ? `, +${items.length - 6} more` : ""}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <form action={bulkAssignGroupAction} className="flex items-center gap-2">
                    <input type="hidden" name="batchId" value={batchId} />
                    <input type="hidden" name="prefix" value={prefix} />
                    <select name="assetId" required className="text-sm rounded border border-border bg-background px-2 py-1 max-w-xs">
                      <option value="">Assign all {items.length} to…</option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {assetLabel(a)}
                        </option>
                      ))}
                    </select>
                    <SubmitButton pendingText="Assigning…" className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground font-medium">
                      Assign all {items.length}
                    </SubmitButton>
                  </form>
                  <form action={bulkDismissGroupAction}>
                    <input type="hidden" name="batchId" value={batchId} />
                    <input type="hidden" name="prefix" value={prefix} />
                    <SubmitButton pendingText="Dismissing…" className="text-xs px-2 py-1 rounded border border-border text-muted">
                      Dismiss all {items.length}
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {ungrouped.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-foreground mb-3">
            No shared prefix ({ungrouped.length} placemark{ungrouped.length === 1 ? "" : "s"})
          </h2>
          <div className="space-y-3">
            {ungroupedPage.map((p) => (
              <PlacemarkCard key={p.name} p={p} batchId={batchId} assets={assets} matchableAssets={matchableAssets} />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center gap-3 mt-4 text-sm">
              <span className="text-muted">
                Page {page} of {pageCount}
              </span>
              {page > 1 && (
                <Link href={`/media/settings/import-kmz/${batchId}?page=${page - 1}`} className="text-accent underline">
                  Previous
                </Link>
              )}
              {page < pageCount && (
                <Link href={`/media/settings/import-kmz/${batchId}?page=${page + 1}`} className="text-accent underline">
                  Next
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {pending.length === 0 && (
        <p className="text-sm text-muted mt-6">Everything in this batch has been resolved.</p>
      )}
    </div>
  );
}

function PlacemarkCard({
  p,
  batchId,
  assets,
  matchableAssets,
}: {
  p: PendingPlacemark;
  batchId: string;
  assets: Array<{ id: string; assetName: string; locationName: string; area: string | null; supplier: { name: string } }>;
  matchableAssets: Array<{ id: string; assetName: string; locationName: string; area: string | null }>;
}) {
  const suggestions = findAssetMatches(p.name, null, matchableAssets).slice(0, 3);
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{p.name}</span>
        <span className="text-xs text-muted">{REASON_LABEL[p.reason]}</span>
      </div>
      <p className="text-xs text-muted mt-0.5">
        {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
      </p>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {suggestions.map((s) => {
            const full = assets.find((a) => a.id === s.asset.id)!;
            return (
              <form action={assignPlacemarkAction} key={s.asset.id}>
                <input type="hidden" name="batchId" value={batchId} />
                <input type="hidden" name="placemarkName" value={p.name} />
                <input type="hidden" name="assetId" value={s.asset.id} />
                <SubmitButton
                  pendingText="Assigning…"
                  className="text-xs px-2 py-1 rounded border border-border hover:border-accent hover:text-accent"
                >
                  {assetLabel(full)} ({Math.round(s.score * 100)}%)
                </SubmitButton>
              </form>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <form action={assignPlacemarkAction} className="flex items-center gap-2">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="placemarkName" value={p.name} />
          <select name="assetId" required className="text-sm rounded border border-border bg-background px-2 py-1 max-w-xs">
            <option value="">Or search all assets…</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {assetLabel(a)}
              </option>
            ))}
          </select>
          <SubmitButton pendingText="Assigning…" className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground font-medium">
            Assign
          </SubmitButton>
        </form>
        <form action={dismissPlacemarkAction}>
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="placemarkName" value={p.name} />
          <SubmitButton pendingText="Dismissing…" className="text-xs px-2 py-1 rounded border border-border text-muted">
            Dismiss
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
