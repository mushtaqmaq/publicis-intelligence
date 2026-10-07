import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";

// The original generic dashboard (asset/supplier inventory counts) — no
// commercial data, so it's a safe default for VIEWER or any role without a
// dedicated dashboard.
async function getDashboardData() {
  const [assetCount, supplierCount, clientCount, planCount, rateCount, latestImport] =
    await Promise.all([
      prisma.asset.count(),
      prisma.supplier.count({ where: { isActive: true } }),
      prisma.client.count(),
      prisma.mediaPlan.count(),
      prisma.assetRate.count(),
      prisma.importJob.findFirst({ orderBy: { createdAt: "desc" } }),
    ]);

  const assetsBySupplier = await prisma.asset.groupBy({
    by: ["supplierId"],
    _count: { _all: true },
  });
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: assetsBySupplier.map((a) => a.supplierId) } },
  });
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const bySupplier = assetsBySupplier
    .map((row) => ({ name: supplierMap.get(row.supplierId) ?? "Unknown", count: row._count._all }))
    .sort((a, b) => b.count - a.count);

  const assetsByFormat = await prisma.asset.groupBy({ by: ["format"], _count: { _all: true } });

  const suppliersByChannel = await prisma.supplier.findMany({
    select: { id: true, mediaChannel: true },
  });
  const channelOfSupplier = new Map(suppliersByChannel.map((s) => [s.id, s.mediaChannel]));
  const byChannelCount = new Map<string, number>();
  for (const row of assetsBySupplier) {
    const channel = channelOfSupplier.get(row.supplierId) ?? "OOH";
    byChannelCount.set(channel, (byChannelCount.get(channel) ?? 0) + row._count._all);
  }
  const byChannel = Array.from(byChannelCount.entries())
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);

  return { assetCount, supplierCount, clientCount, planCount, rateCount, latestImport, bySupplier, assetsByFormat, byChannel };
}

export async function PlatformOverviewDashboard() {
  const data = await getDashboardData();
  const maxSupplierCount = Math.max(1, ...data.bySupplier.map((s) => s.count));
  const maxChannelCount = Math.max(1, ...data.byChannel.map((c) => c.count));

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Dashboard"
        title="Platform Overview"
        subtitle={`Central multi-media rate database — ${data.assetCount.toLocaleString()} assets across ${data.supplierCount} active suppliers spanning OOH, TV, Radio, Print, Cinema, and SMS.`}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
        <StatCard label="Assets" value={data.assetCount} />
        <StatCard label="Active Suppliers" value={data.supplierCount} />
        <StatCard label="Rate Entries" value={data.rateCount} />
        <StatCard label="Clients" value={data.clientCount} />
        <StatCard label="Media Plans" value={data.planCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">Assets by media channel</h2>
          <div className="space-y-2.5">
            {data.byChannel.map((c) => (
              <div key={c.channel} className="flex items-center gap-3 text-sm">
                <div className="w-20 shrink-0 truncate text-muted">{c.channel}</div>
                <div className="flex-1 h-2 rounded bg-border overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${(c.count / maxChannelCount) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right tabular-nums text-foreground">{c.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">Assets by supplier</h2>
          <div className="space-y-2.5">
            {data.bySupplier.slice(0, 10).map((s) => (
              <div key={s.name} className="flex items-center gap-3 text-sm">
                <div className="w-28 shrink-0 truncate text-muted">{s.name}</div>
                <div className="flex-1 h-2 rounded bg-border overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${(s.count / maxSupplierCount) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right tabular-nums text-foreground">{s.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">OOH: Static vs Digital</h2>
          <p className="text-xs text-muted -mt-2 mb-3">Format only applies to out-of-home signage.</p>
          <div className="space-y-2.5">
            {data.assetsByFormat.map((f) => (
              <div key={f.format ?? "null"} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span className="text-muted">{f.format ?? "N/A (non-OOH)"}</span>
                <span className="font-medium tabular-nums">{f._count._all}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">Latest import</h2>
          {data.latestImport ? (
            <div className="text-sm">
              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-[var(--success)] border border-emerald-200">
                {data.latestImport.status}
              </span>
              <span className="ml-2 text-muted">
                {data.latestImport.sourceType.replace(/_/g, " ")} ·{" "}
                {data.latestImport.createdAt.toLocaleDateString()}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted">No imports yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-xs text-muted uppercase tracking-widest">{label}</div>
      <div className="font-serif text-3xl text-foreground mt-1.5 tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
