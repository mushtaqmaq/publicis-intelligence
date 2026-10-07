import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { getSpendAggregation, type Bucket } from "@/lib/reports/spendAggregation";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function BucketTable({ title, buckets }: { title: string; buckets: Bucket[] }) {
  const sorted = [...buckets].sort((a, b) => b.total - a.total);
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-sm font-medium text-foreground mb-3">{title}</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-1.5 pr-3 font-medium">{title.replace("Spend by ", "")}</th>
              <th className="py-1.5 pr-3 font-medium text-right">Assets</th>
              <th className="py-1.5 pr-3 font-medium text-right">Total (QAR)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.label} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3 text-foreground">
                  {b.label}
                  {b.anyPending && <span className="text-[var(--warning)] text-xs ml-1">*</span>}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{b.count}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{money(b.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeCancelled?: string; from?: string; to?: string }>;
}) {
  await requireMediaUser();
  const search = await searchParams;
  const includeCancelled = search.includeCancelled === "1";
  const fromDate = search.from ? new Date(search.from) : null;
  const toDate = search.to ? new Date(search.to) : null;
  const validFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null;
  const validTo = toDate && !Number.isNaN(toDate.getTime()) ? toDate : null;

  const { bySupplier, byClient, byArea, byFormat, byChannel, byAsset, grandTotal, anyPendingOverall, itemCount, planCount } =
    await getSpendAggregation({ includeCancelled, from: validFrom, to: validTo });

  const topAssets = Array.from(byAsset.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const toggleCancelledParams = new URLSearchParams();
  if (search.from) toggleCancelledParams.set("from", search.from);
  if (search.to) toggleCancelledParams.set("to", search.to);
  if (!includeCancelled) toggleCancelledParams.set("includeCancelled", "1");
  const toggleCancelledHref = `/reports${toggleCancelledParams.toString() ? `?${toggleCancelledParams.toString()}` : ""}`;

  const dateRangeLabel =
    validFrom || validTo
      ? ` from ${validFrom ? validFrom.toISOString().slice(0, 10) : "the beginning"} to ${
          validTo ? validTo.toISOString().slice(0, 10) : "now"
        } (by campaign start date)`
      : "";

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface">
        <PageHeader
          title="Reports"
          subtitle={
            <>
              Spend across {planCount} plan(s){includeCancelled ? "" : " (cancelled plans excluded)"}
              {dateRangeLabel}, using each plan&apos;s current (latest) version only — superseded versions are
              never double-counted.
            </>
          }
        />
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <div className="text-sm">
            <span className="text-muted">Grand total: </span>
            <span className="font-semibold text-foreground tabular-nums">QAR {money(grandTotal)}</span>
            {anyPendingOverall && <span className="text-xs text-[var(--warning)] ml-1">— partial, excludes TBD/POA items</span>}
          </div>
          <div className="text-sm text-muted">{itemCount} line item(s)</div>
          <form className="flex items-center gap-2 text-xs" action="/reports">
            {includeCancelled && <input type="hidden" name="includeCancelled" value="1" />}
            <span className="text-muted">Campaign start:</span>
            <input
              type="date"
              name="from"
              defaultValue={search.from ?? ""}
              className="rounded border border-border bg-background px-1.5 py-0.5"
            />
            <span className="text-muted">to</span>
            <input
              type="date"
              name="to"
              defaultValue={search.to ?? ""}
              className="rounded border border-border bg-background px-1.5 py-0.5"
            />
            <button type="submit" className="px-2 py-0.5 rounded bg-accent text-accent-foreground font-medium">
              Apply
            </button>
            {(search.from || search.to) && (
              <a href={includeCancelled ? "/reports?includeCancelled=1" : "/reports"} className="text-accent underline">
                Clear
              </a>
            )}
          </form>
          <Link href={toggleCancelledHref} className="text-xs text-accent underline ml-auto">
            {includeCancelled ? "Exclude cancelled plans" : "Include cancelled plans"}
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-5">
        {planCount === 0 || itemCount === 0 ? (
          <p className="text-sm text-muted">No media plan line items yet — reports will populate once plans have assets added.</p>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            <BucketTable title="Spend by Media Channel" buckets={Array.from(byChannel.values())} />
            <BucketTable title="Spend by Supplier" buckets={Array.from(bySupplier.values())} />
            <BucketTable title="Spend by Client" buckets={Array.from(byClient.values())} />
            <BucketTable title="Spend by Area" buckets={Array.from(byArea.values())} />
            <BucketTable title="Spend by OOH Format" buckets={Array.from(byFormat.values())} />
            <div className="bg-surface border border-border rounded-lg p-5 col-span-2">
              <h2 className="text-sm font-medium text-foreground mb-3">Top 10 Assets by Spend</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Asset</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Line items</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Total (QAR)</th>
                  </tr>
                </thead>
                <tbody>
                  {topAssets.map((a) => (
                    <tr key={a.assetId} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-3">
                        <Link href={`/media/inventory/${a.assetId}`} className="text-foreground hover:underline">
                          {a.label}
                        </Link>
                        {a.anyPending && <span className="text-[var(--warning)] text-xs ml-1">*</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{a.count}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{money(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {anyPendingOverall && (
          <p className="text-xs text-muted mt-4">* includes at least one line item with a TBD/POA cost excluded from its total.</p>
        )}
      </div>
    </div>
  );
}
