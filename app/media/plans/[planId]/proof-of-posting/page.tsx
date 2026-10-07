import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { uploadProofAction, deleteProofAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function ProofOfPostingPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ error?: string; v?: string }>;
}) {
  await requireMediaUser();
  const { planId } = await params;
  const { error, v } = await searchParams;

  const plan = await prisma.mediaPlan.findUnique({
    where: { id: planId },
    include: { client: true, versions: { orderBy: { versionNumber: "desc" }, select: { id: true } } },
  });
  if (!plan) notFound();

  const versionId = (v && plan.versions.some((ver) => ver.id === v)) ? v : plan.versions[0]?.id;
  if (!versionId) notFound();

  const version = await prisma.mediaPlanVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          asset: { include: { supplier: true } },
          proofOfPostings: { orderBy: { postedDate: "desc" }, include: { uploadedBy: true } },
        },
      },
    },
  });

  const postedCount = version.items.filter((i) => i.proofOfPostings.length > 0).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface">
        <Link href={`/media/plans/${planId}`} className="text-sm text-accent underline">
          ← Back to {plan.campaignName}
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Proof of Posting"
            subtitle={`${plan.client.name} · ${postedCount} of ${version.items.length} booked asset(s) have at least one posting photo on file.`}
          />
        </div>
      </div>

      {error && (
        <div className="mx-8 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      <div className="flex-1 overflow-auto px-8 py-5 space-y-6">
        {version.items.length === 0 ? (
          <p className="text-sm text-muted">This plan has no assets yet.</p>
        ) : (
          version.items.map((item) => (
            <div key={item.id} className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div>
                  <Link href={`/media/inventory/${item.asset.id}`} className="font-medium text-foreground hover:underline">
                    {item.asset.assetName}
                  </Link>
                  <div className="text-xs text-muted">
                    {item.asset.supplier.name} · {item.asset.locationName} · booked {fmtDate(item.startDate)} →{" "}
                    {fmtDate(item.endDate)}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded border font-medium ${
                    item.proofOfPostings.length > 0
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-amber-50 text-[var(--warning)] border-amber-200"
                  }`}
                >
                  {item.proofOfPostings.length > 0
                    ? `${item.proofOfPostings.length} photo${item.proofOfPostings.length === 1 ? "" : "s"} on file`
                    : "No proof yet"}
                </span>
              </div>

              {item.proofOfPostings.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {item.proofOfPostings.map((proof) => (
                    <div key={proof.id} className="text-xs">
                      <a href={`/api/proof-of-posting/${proof.id}`} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/proof-of-posting/${proof.id}`}
                          alt=""
                          className="w-full h-24 object-cover rounded border border-border"
                        />
                      </a>
                      <div className="mt-1 text-muted">
                        {fmtDate(proof.postedDate)}
                        {proof.uploadedBy && <> · {proof.uploadedBy.name ?? proof.uploadedBy.email}</>}
                      </div>
                      {proof.notes && <div className="text-muted truncate" title={proof.notes}>{proof.notes}</div>}
                      <form action={deleteProofAction} className="mt-0.5">
                        <input type="hidden" name="planId" value={planId} />
                        <input type="hidden" name="proofId" value={proof.id} />
                        <button type="submit" className="text-[var(--danger)] underline">
                          Remove
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}

              <form action={uploadProofAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="mediaPlanItemId" value={item.id} />
                <div>
                  <label className="block text-[11px] font-medium text-muted uppercase tracking-wide mb-1">Photo</label>
                  <input type="file" name="photo" accept="image/*" required className="text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted uppercase tracking-wide mb-1">Posted Date</label>
                  <input
                    type="date"
                    name="postedDate"
                    required
                    defaultValue={fmtDate(item.startDate)}
                    className="text-xs rounded border border-border bg-background px-2 py-1"
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[11px] font-medium text-muted uppercase tracking-wide mb-1">Notes</label>
                  <input type="text" name="notes" className="w-full text-xs rounded border border-border bg-background px-2 py-1" />
                </div>
                <button type="submit" className="text-xs px-3 py-1.5 rounded bg-accent text-accent-foreground font-medium">
                  Upload
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
