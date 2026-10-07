import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { importKmzAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

interface ResultSummary {
  filename: string;
  supplierName: string;
  placemarkCount: number;
  applied: Array<{ n: string; a: string; l: string; sup?: string; s: number }>;
  appliedCount: number;
  skippedAlreadyGeocoded: number;
  pendingCount: number;
  batchId: string | null;
}

export default async function ImportKmzPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; result?: string }>;
}) {
  await requireMediaUser();
  const { error, result } = await searchParams;
  const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });

  let summary: ResultSummary | null = null;
  if (result) {
    try {
      summary = JSON.parse(result);
    } catch {
      summary = null;
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Import Asset Locations (KMZ)"
        subtitle={
          <>
            Upload a Google Earth export (.kmz or .kml) to add real GPS coordinates to assets on the Map —
            either one supplier&apos;s file, or a single combined file with placemarks from several suppliers at
            once (matched against every supplier&apos;s assets together). Every placemark is matched using the
            same scorer duplicate-asset detection relies on — a confident, unambiguous match is applied
            automatically; anything ambiguous is skipped and reported below, never guessed. An asset that
            already has coordinates is never overwritten.
          </>
        }
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      <form action={importKmzAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Supplier</label>
          <select name="supplierId" required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="">Select supplier…</option>
            <option value="__ALL__">All suppliers (combined file)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">KMZ / KML File</label>
          <input
            type="file"
            name="file"
            accept=".kmz,.kml"
            required
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-foreground file:cursor-pointer hover:file:opacity-90"
          />
        </div>
        <SubmitButton pendingText="Uploading & matching…" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
          Import
        </SubmitButton>
      </form>

      {summary && (
        <div className="mt-6 bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-2">
            {summary.filename} — {summary.supplierName}
          </h2>
          <p className="text-sm text-muted mb-3">
            {summary.placemarkCount} named placemark(s) found. <strong className="text-foreground">{summary.appliedCount} new coordinate(s) applied.</strong>
          </p>

          {summary.applied.length > 0 && (
            <table className="w-full text-sm border-collapse mb-4">
              <thead>
                <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">KMZ Point</th>
                  <th className="py-1.5 pr-3 font-medium">Matched Asset</th>
                  {summary.applied.some((a) => a.sup) && <th className="py-1.5 pr-3 font-medium">Supplier</th>}
                  <th className="py-1.5 pr-3 font-medium text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {summary.applied.map((a, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-1.5 pr-3">{a.n}</td>
                    <td className="py-1.5 pr-3 text-muted">
                      {a.a} / {a.l}
                    </td>
                    {summary.applied.some((x) => x.sup) && <td className="py-1.5 pr-3 text-muted">{a.sup ?? "—"}</td>}
                    <td className="py-1.5 pr-3 text-right tabular-nums">{a.s}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {summary.appliedCount > summary.applied.length && (
            <p className="text-xs text-muted mb-3">
              +{summary.appliedCount - summary.applied.length} more applied — see the Audit Log for the full list.
            </p>
          )}

          <div className="text-xs text-muted space-y-1">
            {summary.skippedAlreadyGeocoded > 0 && <p>{summary.skippedAlreadyGeocoded} skipped — asset already had coordinates.</p>}
          </div>

          {summary.pendingCount > 0 && summary.batchId && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-[var(--warning)]">
                <strong>{summary.pendingCount} placemark(s)</strong> could not be confidently and unambiguously
                matched — nothing was guessed. Review them and assign each to the right asset, individually or in
                bulk by code prefix.
              </p>
              <Link
                href={`/media/settings/import-kmz/${summary.batchId}`}
                className="inline-block mt-2 rounded-md bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium"
              >
                Review {summary.pendingCount} placemark(s) →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
