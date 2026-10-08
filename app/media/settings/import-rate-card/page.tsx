import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import { uploadRateCardAction, getSuppliersForUpload } from "./actions";
import { AutoDetectFields } from "./AutoDetectFields";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function ImportRateCardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireMediaUser("settings");
  const [{ error }, suppliers, recentVersions] = await Promise.all([
    searchParams,
    getSuppliersForUpload(),
    prisma.rateCardVersion.findMany({
      where: { status: { in: ["REVIEW", "PARSING", "FAILED"] } },
      include: { rateCard: { include: { supplier: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const currentYear = new Date().getFullYear();

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Import Rate Card"
        subtitle="Upload a supplier rate card (PDF, XLSX, XLS, or CSV). It will be parsed automatically, but nothing is published to inventory until an Admin reviews and approves it on the next screen."
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <form action={uploadRateCardAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <AutoDetectFields suppliers={suppliers} currentYear={currentYear} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Version Label
            </label>
            <input
              type="text"
              name="versionLabel"
              defaultValue="V1"
              placeholder="V1"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Effective From
            </label>
            <input
              type="date"
              name="effectiveFrom"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Rate Card Title (optional)
          </label>
          <input
            type="text"
            name="rateCardTitle"
            placeholder="Defaults to the filename"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <SubmitButton pendingText="Uploading & parsing…" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
          Upload &amp; Parse
        </SubmitButton>
      </form>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-[var(--warning)]">
        <strong>Extraction is best-effort, not guaranteed.</strong> PDF rate cards are especially
        inconsistent in layout — expect LOW-confidence candidates on some pages, and always check
        the review screen before publishing. Supplier and year are guessed from the filename once
        you pick a file — always double-check them, especially for a generic filename the guess
        can&apos;t confidently match.
      </div>

      {recentVersions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-foreground mb-3">Awaiting review or failed</h2>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {recentVersions.map((v) => (
                <tr key={v.id} className="border-b border-border">
                  <td className="py-2 pr-4">{v.rateCard.supplier.name}</td>
                  <td className="py-2 pr-4">
                    {v.storageUrl.startsWith("http") ? (
                      <a href={`/api/rate-cards/${v.id}/file`} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                        {v.originalFilename}
                      </a>
                    ) : (
                      v.originalFilename
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200">
                      {v.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {v.status === "REVIEW" && (
                      <a href={`/media/settings/rate-cards/${v.id}/review`} className="text-accent underline">
                        Review →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
