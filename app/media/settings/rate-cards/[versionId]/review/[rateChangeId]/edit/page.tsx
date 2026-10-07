import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { editCandidateAction } from "../../actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const MONEY_STATUSES = ["KNOWN", "TBD", "NOT_APPLICABLE", "ON_REQUEST", "POA", "TO_BE_CONFIRMED"] as const;

interface EditableNewValue {
  grossRate: number | null;
  grossRateStatus: string;
  durationValue: number | null;
  durationUnit: string | null;
  quantityLabel: string | null;
  sourcePage: number | null;
  durationLabel?: string | null;
}

export default async function EditCandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string; rateChangeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireMediaUser();
  const { versionId, rateChangeId } = await params;
  const { error } = await searchParams;

  const change = await prisma.rateChange.findUnique({
    where: { id: rateChangeId },
    include: { rateCardVersion: { include: { rateCard: { include: { supplier: true } } } } },
  });
  if (!change || change.rateCardVersionId !== versionId) notFound();

  const newValue = change.newValue as unknown as EditableNewValue;

  return (
    <div className="p-8 max-w-2xl">
      <Link href={`/media/settings/rate-cards/${versionId}/review`} className="text-sm text-accent underline">
        ← Back to review
      </Link>

      <div className="mt-2">
        <PageHeader
          title="Edit Candidate"
          subtitle={
            <>
              {change.rateCardVersion.rateCard.supplier.name} · {change.rateCardVersion.originalFilename}
              {newValue.sourcePage ? `, p.${newValue.sourcePage}` : ""} · extracted as {change.changeType}
            </>
          }
        />
      </div>
      <p className="text-xs text-muted mt-1">
        Only what the parser extracted for this candidate can be corrected here — it never touches
        a published rate. Editing is only available while the row is still PENDING.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {change.decision !== "PENDING" ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-[var(--warning)]">
          This candidate is already {change.decision} — it can no longer be edited.
        </div>
      ) : (
        <form action={editCandidateAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
          <input type="hidden" name="rateChangeId" value={rateChangeId} />
          <input type="hidden" name="versionId" value={versionId} />

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Asset Name</label>
            <input
              type="text"
              name="candidateAssetName"
              defaultValue={change.candidateAssetName}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Location</label>
            <input
              type="text"
              name="candidateLocation"
              defaultValue={change.candidateLocation ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Gross Rate Status</label>
              <select
                name="grossRateStatus"
                defaultValue={newValue.grossRateStatus}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              >
                {MONEY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Gross Rate (QAR)</label>
              <input
                type="number"
                name="grossRate"
                step="0.01"
                defaultValue={newValue.grossRate ?? ""}
                placeholder="Only used when status is KNOWN"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Duration Value</label>
              <input
                type="number"
                name="durationValue"
                defaultValue={newValue.durationValue ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Duration Unit</label>
              <input
                type="text"
                name="durationUnit"
                defaultValue={newValue.durationUnit ?? ""}
                placeholder="days, weeks, months…"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Quantity Label</label>
              <input
                type="text"
                name="quantityLabel"
                defaultValue={newValue.quantityLabel ?? ""}
                placeholder="Faces, Screens, Circuits, Poles, Networks…"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Source Page</label>
              <input
                type="number"
                name="sourcePage"
                defaultValue={newValue.sourcePage ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
            Save Correction
          </button>
        </form>
      )}
    </div>
  );
}
