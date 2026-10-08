import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

function money(value: unknown, currency = "QAR") {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "object" && value !== null ? Number(value.toString()) : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default async function RateVersionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireMediaUser("settings");
  const { q } = await searchParams;

  const assets = q
    ? await prisma.asset.findMany({
        where: {
          OR: [
            { assetName: { contains: q, mode: "insensitive" } },
            { assetCode: { contains: q, mode: "insensitive" } },
          ],
        },
        include: {
          supplier: { select: { name: true } },
          rates: {
            orderBy: [{ rateYear: "desc" }, { effectiveFrom: "desc" }],
            include: { rateCardVersion: { select: { versionLabel: true, originalFilename: true, status: true } } },
          },
        },
        take: 25,
        orderBy: { assetName: "asc" },
      })
    : [];

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Settings"
        title="Rate Versions"
        subtitle="Search an asset to see its full rate history across every rate-card version it has ever appeared in — including rates superseded by a newer year."
      />

      <form className="mt-4" action="/settings/rate-versions">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search asset name or code…"
          className="w-full max-w-md rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </form>

      {q && assets.length === 0 && (
        <p className="text-sm text-muted mt-6">No assets match &quot;{q}&quot;.</p>
      )}

      <div className="mt-6 space-y-6">
        {assets.map((asset) => (
          <div key={asset.id} className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="font-medium text-foreground">{asset.assetName}</span>
                <span className="text-xs text-muted ml-2">{asset.assetCode}</span>
              </div>
              <span className="text-xs text-muted">{asset.supplier.name}</span>
            </div>

            <table className="w-full text-sm border-collapse mt-3">
              <thead>
                <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                  <th className="py-1.5 pr-4 font-medium">Rate Year</th>
                  <th className="py-1.5 pr-4 font-medium">Basis</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Rate</th>
                  <th className="py-1.5 pr-4 font-medium">Effective From</th>
                  <th className="py-1.5 pr-4 font-medium">Rate Card Version</th>
                  <th className="py-1.5 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {asset.rates.map((rate, i) => (
                  <tr key={rate.id} className={`border-b border-border last:border-0 ${i > 0 ? "text-muted" : ""}`}>
                    <td className="py-1.5 pr-4 tabular-nums">{rate.rateYear}</td>
                    <td className="py-1.5 pr-4">{rate.pricingBasis.replace(/_/g, " ")}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">
                      {rate.grossRateStatus === "KNOWN" ? money(rate.grossRate, rate.currency) : rate.grossRateStatus}
                    </td>
                    <td className="py-1.5 pr-4">{rate.effectiveFrom.toLocaleDateString()}</td>
                    <td className="py-1.5 pr-4 font-mono text-xs">
                      {rate.rateCardVersion.versionLabel} — {rate.rateCardVersion.originalFilename}
                    </td>
                    <td className="py-1.5 pr-4">
                      {i === 0 ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                          Current
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">
                          Superseded
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {asset.rates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 text-muted">
                      No rates on file for this asset.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
