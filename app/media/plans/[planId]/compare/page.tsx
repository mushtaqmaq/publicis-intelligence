import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

function money(v: unknown) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : null;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

type DiffStatus = "added" | "removed" | "changed" | "unchanged";

const STATUS_LABEL: Record<DiffStatus, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
};

const STATUS_CLASS: Record<DiffStatus, string> = {
  added: "bg-green-50 text-green-700 border-green-200",
  removed: "bg-red-50 text-[var(--danger)] border-red-200",
  changed: "bg-amber-50 text-[var(--warning)] border-amber-200",
  unchanged: "bg-gray-50 text-muted border-border",
};

export default async function CompareVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { planId } = await params;
  const search = await searchParams;

  const plan = await prisma.mediaPlan.findUnique({
    where: { id: planId },
    include: {
      client: true,
      versions: { orderBy: { versionNumber: "asc" }, select: { id: true, versionNumber: true, label: true, isLocked: true } },
    },
  });
  if (!plan) notFound();
  if (plan.versions.length < 2) {
    return (
      <div className="px-8 py-6">
        <Link href={`/media/plans/${planId}`} className="text-sm text-accent underline">
          ← Back to plan
        </Link>
        <p className="text-sm text-muted mt-4">
          This plan only has one version — there is nothing to compare yet. Create a new version
          from the plan page first.
        </p>
      </div>
    );
  }

  const versionAId = plan.versions.some((v) => v.id === search.a) ? search.a! : plan.versions[plan.versions.length - 2].id;
  const versionBId = plan.versions.some((v) => v.id === search.b) ? search.b! : plan.versions[plan.versions.length - 1].id;

  const [versionA, versionB] = await Promise.all([
    prisma.mediaPlanVersion.findUniqueOrThrow({
      where: { id: versionAId },
      include: { items: { include: { asset: { include: { supplier: true } } } } },
    }),
    prisma.mediaPlanVersion.findUniqueOrThrow({
      where: { id: versionBId },
      include: { items: { include: { asset: { include: { supplier: true } } } } },
    }),
  ]);

  const itemsByAsset = (v: typeof versionA) => {
    const map = new Map<string, (typeof v.items)[number]>();
    for (const item of v.items) map.set(item.assetId, item);
    return map;
  };
  const mapA = itemsByAsset(versionA);
  const mapB = itemsByAsset(versionB);
  const allAssetIds = new Set([...mapA.keys(), ...mapB.keys()]);

  const rows = Array.from(allAssetIds).map((assetId) => {
    const itemA = mapA.get(assetId) ?? null;
    const itemB = mapB.get(assetId) ?? null;
    const asset = (itemA ?? itemB)!.asset;

    let status: DiffStatus;
    if (!itemA) status = "added";
    else if (!itemB) status = "removed";
    else {
      const same =
        itemA.selectedCircuits === itemB.selectedCircuits &&
        itemA.selectedFaces === itemB.selectedFaces &&
        String(itemA.discountPct) === String(itemB.discountPct) &&
        String(itemA.additionalDiscountPct) === String(itemB.additionalDiscountPct) &&
        String(itemA.lineTotal) === String(itemB.lineTotal) &&
        fmtDate(itemA.startDate) === fmtDate(itemB.startDate) &&
        fmtDate(itemA.endDate) === fmtDate(itemB.endDate);
      status = same ? "unchanged" : "changed";
    }

    return { assetId, asset, itemA, itemB, status };
  });

  rows.sort((r1, r2) => {
    const order: Record<DiffStatus, number> = { added: 0, removed: 1, changed: 2, unchanged: 3 };
    if (order[r1.status] !== order[r2.status]) return order[r1.status] - order[r2.status];
    return r1.asset.assetName.localeCompare(r2.asset.assetName);
  });

  const totalOf = (v: typeof versionA) =>
    v.items.reduce((sum, item) => (item.lineTotal !== null ? sum + Number(item.lineTotal) : sum), 0);
  const totalA = totalOf(versionA);
  const totalB = totalOf(versionB);
  const anyPendingA = versionA.items.some((i) => i.excludesPendingCost);
  const anyPendingB = versionB.items.some((i) => i.excludesPendingCost);

  const labelOf = (id: string) => plan.versions.find((v) => v.id === id)?.label ?? id;

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface">
        <Link href={`/media/plans/${planId}`} className="text-sm text-accent underline">
          ← Back to {plan.campaignName}
        </Link>
        <div className="mt-2">
          <PageHeader title="Compare Versions" />
        </div>

        <form className="flex items-center gap-3 mt-3" action={`/media/plans/${planId}/compare`}>
          <span className="text-xs text-muted">Comparing</span>
          <select name="a" defaultValue={versionAId} className="text-xs rounded border border-border bg-background px-2 py-1">
            {plan.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} {v.isLocked ? "🔒" : ""}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">against</span>
          <select name="b" defaultValue={versionBId} className="text-xs rounded border border-border bg-background px-2 py-1">
            {plan.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} {v.isLocked ? "🔒" : ""}
              </option>
            ))}
          </select>
          <button type="submit" className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground font-medium">
            Compare
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-auto px-8 py-5">
        <div className="grid grid-cols-3 gap-6 mb-6 text-sm">
          <div>
            <div className="text-xs text-muted uppercase tracking-wide">{labelOf(versionAId)} total</div>
            <div className="text-lg font-semibold text-foreground tabular-nums mt-0.5">
              QAR {totalA.toLocaleString()}
              {anyPendingA && <span className="text-xs text-[var(--warning)] font-normal"> (partial)</span>}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wide">{labelOf(versionBId)} total</div>
            <div className="text-lg font-semibold text-foreground tabular-nums mt-0.5">
              QAR {totalB.toLocaleString()}
              {anyPendingB && <span className="text-xs text-[var(--warning)] font-normal"> (partial)</span>}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wide">Difference</div>
            <div
              className={`text-lg font-semibold tabular-nums mt-0.5 ${
                totalB - totalA > 0 ? "text-[var(--warning)]" : totalB - totalA < 0 ? "text-green-700" : "text-foreground"
              }`}
            >
              {totalB - totalA >= 0 ? "+" : ""}
              QAR {(totalB - totalA).toLocaleString()}
            </div>
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Asset</th>
              <th className="py-2 pr-4 font-medium text-right">{labelOf(versionAId)} Qty</th>
              <th className="py-2 pr-4 font-medium text-right">{labelOf(versionBId)} Qty</th>
              <th className="py-2 pr-4 font-medium text-right">{labelOf(versionAId)} Total</th>
              <th className="py-2 pr-4 font-medium text-right">{labelOf(versionBId)} Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.assetId} className="border-b border-border">
                <td className="py-2 pr-4">
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_CLASS[row.status]}`}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <Link href={`/media/inventory/${row.assetId}`} className="font-medium text-foreground hover:underline">
                    {row.asset.assetName}
                  </Link>
                  <div className="text-xs text-muted">
                    {row.asset.supplier.name} · {row.asset.locationName}
                  </div>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {row.itemA ? row.itemA.selectedCircuits ?? row.itemA.selectedFaces ?? "—" : "—"}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {row.itemB ? row.itemB.selectedCircuits ?? row.itemB.selectedFaces ?? "—" : "—"}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{row.itemA ? money(row.itemA.lineTotal) ?? "TBD" : "—"}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{row.itemB ? money(row.itemB.lineTotal) ?? "TBD" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-muted mt-6">Neither version has any line items yet.</p>}
      </div>
    </div>
  );
}
