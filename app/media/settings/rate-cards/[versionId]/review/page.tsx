import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  publishOneAction,
  publishAsNewAssetAction,
  rejectOneAction,
  publishAllAction,
  resolveReconciliationAction,
  mergeIntoAssetAction,
} from "./actions";

const RECONCILIATION_ACTIONS = ["KEEP_EXCEL", "USE_RATE_CARD", "MANUAL_VALUE", "NEEDS_DISCUSSION"] as const;

export const dynamic = "force-dynamic";

const CHANGE_TYPE_ORDER = ["CONFLICT", "LOW_CONFIDENCE", "NEW", "CHANGED", "UNCHANGED"] as const;
const CHANGE_TYPE_LABEL: Record<string, string> = {
  CONFLICT: "Conflict — multiple possible matches",
  LOW_CONFIDENCE: "Low confidence — needs manual review",
  NEW: "New asset",
  CHANGED: "Rate changed",
  UNCHANGED: "No change",
};
const CHANGE_TYPE_STYLE: Record<string, string> = {
  CONFLICT: "bg-red-50 text-[var(--danger)] border-red-200",
  LOW_CONFIDENCE: "bg-amber-50 text-[var(--warning)] border-amber-200",
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  CHANGED: "bg-amber-50 text-[var(--warning)] border-amber-200",
  UNCHANGED: "bg-gray-50 text-gray-600 border-gray-200",
};

function money(v: unknown) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

export default async function ReviewRateCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireMediaUser("settings");
  const { versionId } = await params;
  const { error } = await searchParams;

  const version = await prisma.rateCardVersion.findUnique({
    where: { id: versionId },
    include: { rateCard: { include: { supplier: true } } },
  });
  if (!version) notFound();

  const [changes, existingAssets] = await Promise.all([
    prisma.rateChange.findMany({
      where: { rateCardVersionId: versionId },
      include: { asset: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.asset.findMany({
      where: { supplierId: version.rateCard.supplierId },
      select: { id: true, assetName: true, locationName: true },
      orderBy: { assetName: "asc" },
    }),
  ]);

  const reconciliations = await prisma.reconciliation.findMany({
    where: { rateCardVersionId: versionId, status: "OPEN" },
  });

  const grouped = CHANGE_TYPE_ORDER.map((type) => ({
    type,
    rows: changes.filter((c) => c.changeType === type),
  })).filter((g) => g.rows.length > 0);

  const eligibleCount = changes.filter(
    (c) => c.decision === "PENDING" && ["NEW", "CHANGED", "UNCHANGED"].includes(c.changeType)
  ).length;

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Settings"
        title={
          <>
            Review: {version.rateCard.supplier.name} —{" "}
            {version.storageUrl.startsWith("http") ? (
              <a href={`/api/rate-cards/${version.id}/file`} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                {version.originalFilename}
              </a>
            ) : (
              version.originalFilename
            )}
          </>
        }
        subtitle={`${version.rateYear} rate card, version ${version.versionLabel} · ${changes.length} candidate(s) extracted`}
        actions={
          eligibleCount > 0 && (
            <form action={publishAllAction}>
              <input type="hidden" name="versionId" value={versionId} />
              <button className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
                Publish All Eligible ({eligibleCount})
              </button>
            </form>
          )
        }
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {reconciliations.length > 0 && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="text-sm font-semibold text-[var(--danger)] mb-2">
            Reconciliation required — {reconciliations.length} value(s) conflict with the Excel migration
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--danger)]/70">
                <th className="py-1 pr-4">Asset</th>
                <th className="py-1 pr-4">Excel value</th>
                <th className="py-1 pr-4">Rate-card value</th>
                <th className="py-1 pr-4">Difference</th>
                <th className="py-1 pr-4">Source page</th>
                <th className="py-1 pr-4">Resolve</th>
              </tr>
            </thead>
            <tbody>
              {reconciliations.map((r) => (
                <tr key={r.id} className="border-t border-red-200/60 align-top">
                  <td className="py-1.5 pr-4">{r.candidateAssetName}</td>
                  <td className="py-1.5 pr-4 tabular-nums">{r.excelValue}</td>
                  <td className="py-1.5 pr-4 tabular-nums">{r.rateCardValue}</td>
                  <td className="py-1.5 pr-4 tabular-nums">{r.difference ?? "—"}</td>
                  <td className="py-1.5 pr-4">{r.sourcePage ?? "—"}</td>
                  <td className="py-1.5 pr-4">
                    <form action={resolveReconciliationAction} className="flex flex-col gap-1.5 min-w-[220px]">
                      <input type="hidden" name="reconciliationId" value={r.id} />
                      <input type="hidden" name="versionId" value={versionId} />
                      <select
                        name="recommendedAction"
                        defaultValue={r.recommendedAction}
                        className="text-xs rounded border border-red-200 bg-white px-1.5 py-1"
                      >
                        {RECONCILIATION_ACTIONS.map((a) => (
                          <option key={a} value={a}>
                            {a.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        name="resolutionNotes"
                        required
                        placeholder="Resolution note (required)"
                        className="text-xs rounded border border-red-200 bg-white px-1.5 py-1"
                      />
                      <button type="submit" className="text-xs px-2 py-1 rounded bg-[var(--danger)] text-white font-medium self-start">
                        Mark Resolved
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[var(--danger)]/80 mt-2">
            Publishing the corresponding rate change below still records the new value with full
            source traceability. This table exists so the Excel-era value is never silently lost.
            Resolving here just records a decision + reason to the Audit Log — it doesn&apos;t
            change any published rate itself.
          </p>
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.type} className="mt-8">
          <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <span className={`inline-block px-2 py-0.5 rounded text-xs border ${CHANGE_TYPE_STYLE[group.type]}`}>
              {CHANGE_TYPE_LABEL[group.type]}
            </span>
            <span className="text-xs text-muted">({group.rows.length})</span>
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4 font-medium">Asset / Location</th>
                <th className="py-2 pr-4 font-medium">Old value</th>
                <th className="py-2 pr-4 font-medium">New value</th>
                <th className="py-2 pr-4 font-medium">Confidence</th>
                <th className="py-2 pr-4 font-medium">Page</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => {
                const newValue = row.newValue as Record<string, unknown> | null;
                const oldValue = row.oldValue as Record<string, unknown> | null;
                return (
                  <tr key={row.id} className="border-b border-border align-top">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-foreground">{row.candidateAssetName}</div>
                      {row.candidateLocation && (
                        <div className="text-xs text-muted">{row.candidateLocation}</div>
                      )}
                      {row.asset && (
                        <div className="text-xs text-muted">matched → {row.asset.assetName}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {oldValue ? `QAR ${money(oldValue.grossRate)}` : "—"}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {newValue?.grossRateStatus === "KNOWN"
                        ? `QAR ${money(newValue.grossRate)}`
                        : (newValue?.grossRateStatus as string) ?? "—"}
                      {Boolean(newValue?.durationLabel) && (
                        <span className="text-xs text-muted"> / {String(newValue?.durationLabel)}</span>
                      )}
                      {Array.isArray(newValue?.unclassifiedAmounts) &&
                        (newValue!.unclassifiedAmounts as string[]).length > 0 && (
                          <div className="text-xs text-[var(--warning)] mt-0.5">
                            Unlabeled amounts found: {(newValue!.unclassifiedAmounts as string[]).join(", ")}
                          </div>
                        )}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-xs border ${
                          row.extractionConfidence === "HIGH"
                            ? "bg-emerald-50 text-[var(--success)] border-emerald-200"
                            : row.extractionConfidence === "MEDIUM"
                              ? "bg-amber-50 text-[var(--warning)] border-amber-200"
                              : "bg-red-50 text-[var(--danger)] border-red-200"
                        }`}
                      >
                        {row.extractionConfidence}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{(newValue?.sourcePage as number | null) ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-xs border ${
                          row.decision === "PUBLISHED"
                            ? "bg-emerald-50 text-[var(--success)] border-emerald-200"
                            : row.decision === "REJECTED"
                              ? "bg-gray-50 text-gray-500 border-gray-200"
                              : "bg-white text-muted border-border"
                        }`}
                      >
                        {row.decision}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {row.decision === "PENDING" ? (
                        <div className="flex justify-end items-center gap-2">
                          {!row.assetId ? (
                            <>
                              <form action={mergeIntoAssetAction} className="flex items-center gap-1">
                                <input type="hidden" name="rateChangeId" value={row.id} />
                                <input type="hidden" name="versionId" value={versionId} />
                                <select
                                  name="mergeIntoAssetId"
                                  defaultValue=""
                                  className="text-xs rounded border border-border bg-background px-1 py-0.5 max-w-[140px]"
                                >
                                  <option value="">Merge into…</option>
                                  {existingAssets.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.assetName} — {a.locationName}
                                    </option>
                                  ))}
                                </select>
                                <button type="submit" className="text-xs text-accent underline shrink-0">
                                  Merge
                                </button>
                              </form>
                              <form
                                action={publishAsNewAssetAction.bind(null, row.id, versionId)}
                              >
                                <button className="text-xs text-accent underline">
                                  Publish as new
                                </button>
                              </form>
                            </>
                          ) : (
                            <form action={publishOneAction.bind(null, row.id, versionId)}>
                              <button className="text-xs text-accent underline">Publish</button>
                            </form>
                          )}
                          <Link href={`/media/settings/rate-cards/${versionId}/review/${row.id}/edit`} className="text-xs text-muted underline">
                            Edit
                          </Link>
                          <form action={rejectOneAction.bind(null, row.id, versionId)}>
                            <button className="text-xs text-muted underline">Reject</button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

    </div>
  );
}
