import Link from "next/link";
import type { ComponentType } from "react";
import { Wallet, Layers, Percent, Target as TargetIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSpendAggregation } from "@/lib/reports/spendAggregation";
import type { SessionUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";

function money(n: number, currency = "QAR") {
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const ACTIVE_STATUSES = ["APPROVED", "BOOKED", "SCHEDULED", "LIVE"];
const CHART_PALETTE = ["#C9A96A", "#111827", "#B8BDC7", "#8A7550", "#5B6472", "#E4DFD3", "#7C6A45"];

export async function AdminDashboard({ user }: { user: SessionUser }) {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(`${currentYear}-01-01`);
  const yearEnd = new Date(`${currentYear}-12-31T23:59:59`);

  const [aggregation, activeCampaignsCount, revenueTarget, avrSchemes, retainerFees] = await Promise.all([
    getSpendAggregation({ from: yearStart, to: yearEnd }),
    prisma.mediaPlan.count({ where: { status: { in: ACTIVE_STATUSES as never } } }),
    prisma.revenueTarget.findUnique({ where: { year: currentYear } }),
    prisma.avrScheme.findMany({
      where: { year: currentYear },
      include: { supplier: { select: { name: true } }, slabs: { orderBy: { thresholdFrom: "asc" } } },
    }),
    prisma.retainerFee.findMany({ where: { year: currentYear } }),
  ]);

  const topClients = Array.from(aggregation.byClient.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  const topSuppliers = Array.from(aggregation.bySupplier.values()).sort((a, b) => b.total - a.total).slice(0, 10);

  // Real agency revenue — Agency Fee + IR (both real, per-plan figures) plus
  // real retainer invoices logged for the year. Never the gross client
  // billing total (aggregation.grandTotal), which is mostly pass-through
  // media cost that belongs to suppliers, not the agency.
  const retainerFeeTotal = retainerFees.reduce((sum, f) => sum + Number(f.amount), 0);
  const revenue = aggregation.agencyFeeRealTotal + aggregation.irRealTotal + retainerFeeTotal;
  const hasRealRevenueData = aggregation.agencyFeeRealTotal > 0 || aggregation.irRealTotal > 0 || retainerFeeTotal > 0;

  const spend = aggregation.grandTotal;
  const target = revenueTarget ? Number(revenueTarget.targetAmount) : null;
  const achieved = revenue;
  const remaining = target !== null ? Math.max(0, target - achieved) : null;
  const achievementPct = target ? Math.min(100, (achieved / target) * 100) : null;
  const monthsElapsed = new Date().getMonth() + 1;
  const requiredMonthlyRunRate = remaining !== null ? remaining / Math.max(1, 12 - monthsElapsed + 1) : null;
  const projectedYearEnd = achieved > 0 && monthsElapsed > 0 ? (achieved / monthsElapsed) * 12 : null;

  // AVR progress: real spend (from the aggregation above, keyed by supplier
  // name — a supplier's spend is shared across all its AVR categories,
  // since bookings aren't tagged per AVR category today) against the real
  // slabs you entered. No scheme entered = no number shown, ever.
  const avrProgress = avrSchemes.map((scheme) => {
    const spend = aggregation.bySupplier.get(scheme.supplier.name)?.total ?? 0;
    const sortedSlabs = scheme.slabs;
    const currentSlabIndex = [...sortedSlabs].reverse().findIndex((s) => spend >= Number(s.thresholdFrom));
    const currentSlab = currentSlabIndex >= 0 ? sortedSlabs[sortedSlabs.length - 1 - currentSlabIndex] : null;
    const nextSlab = sortedSlabs.find((s) => Number(s.thresholdFrom) > spend) ?? null;
    return {
      key: `${scheme.id}`,
      supplierName: scheme.supplier.name,
      category: scheme.category,
      spend,
      currentSlab,
      nextSlab,
      remaining: nextSlab ? Number(nextSlab.thresholdFrom) - spend : 0,
      progressPct: nextSlab ? Math.min(100, (spend / Number(nextSlab.thresholdFrom)) * 100) : 100,
      estimatedValue: currentSlab ? spend * Number(currentSlab.rebatePct) : 0,
    };
  });
  const closestOpportunities = avrProgress
    .filter((a) => a.nextSlab)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 3);

  const monthlySeries = Array.from({ length: 12 }, (_, i) => {
    const key = `${currentYear}-${String(i + 1).padStart(2, "0")}`;
    return { month: key, total: aggregation.byMonth.get(key)?.total ?? 0 };
  });

  const channelBreakdown = Array.from(aggregation.byChannel.values())
    .sort((a, b) => b.total - a.total)
    .map((c, i) => ({ ...c, pct: spend > 0 ? (c.total / spend) * 100 : 0, color: CHART_PALETTE[i % CHART_PALETTE.length] }));

  // Bundle AVR progress by supplier — several categories under Elan, for
  // example, are grouped into one card instead of repeating the supplier
  // name on every row.
  const avrBySupplier = new Map<string, typeof avrProgress>();
  for (const a of avrProgress) {
    if (!avrBySupplier.has(a.supplierName)) avrBySupplier.set(a.supplierName, []);
    avrBySupplier.get(a.supplierName)!.push(a);
  }

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${user.name ?? user.email}.`}
        subtitle={`Commercial overview for ${currentYear} — ${aggregation.planCount} active plan(s), ${aggregation.itemCount} line item(s), using each plan's current version only.`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <StatCard
          icon={Wallet}
          label="Revenue (YTD)"
          value={hasRealRevenueData ? money(revenue) : "—"}
          hint={
            hasRealRevenueData
              ? `Agency Fee ${money(aggregation.agencyFeeRealTotal)} + IR ${money(aggregation.irRealTotal)} + Retainers ${money(retainerFeeTotal)}`
              : "No real Agency Fee, IR, or retainer fees logged yet."
          }
        />
        <StatCard icon={Layers} label="Active Campaigns" value={activeCampaignsCount} />
        <StatCard
          icon={Percent}
          label="Agency Fees"
          value={aggregation.agencyFeeRealTotal > 0 ? money(aggregation.agencyFeeRealTotal) : aggregation.agencyFeesCoveredTotal > 0 ? money(aggregation.agencyFeesEstimated) : "—"}
          hint={
            aggregation.agencyFeeRealTotal > 0
              ? "Real, from logged plan fees."
              : aggregation.agencyFeesCoveredTotal > 0
                ? `Estimated at each client's default fee % — not a reconciled actual.`
                : "No client has a default agency fee % on file yet."
          }
        />
        <StatCard
          icon={TargetIcon}
          label="Revenue Target"
          value={target !== null ? money(target) : "Not set"}
          hint={target === null ? undefined : `${achievementPct!.toFixed(1)}% achieved`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-medium text-foreground">Spend & Performance — {currentYear}</h2>
          </div>
          <div className="font-serif text-2xl text-foreground">{money(spend)}</div>
          <p className="text-xs text-muted -mt-0.5">Total client billings (gross media spend) — see Revenue above for the agency&apos;s own earnings.</p>
          <SpendTrendChart series={monthlySeries} />
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">Media Mix</h2>
          {channelBreakdown.length === 0 ? (
            <p className="text-sm text-muted">No spend recorded yet this year.</p>
          ) : (
            <MediaMixDonut breakdown={channelBreakdown} total={spend} />
          )}
        </div>
      </div>

      {/* Revenue Target Tracker */}
      <section className="bg-surface border border-border rounded-lg p-5 mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Revenue Target Tracker — {currentYear}</h2>
          <Link href="/planning/settings/revenue-targets" className="text-xs text-accent underline">
            {target === null ? "+ Set Target" : "Edit Target"}
          </Link>
        </div>
        {target === null ? (
          <p className="text-sm text-muted mt-3">
            No revenue target on file for {currentYear}. Add your real annual target to turn this into a live
            tracker — nothing is estimated until you do.
          </p>
        ) : (
          <>
            <div className="h-3 rounded bg-border overflow-hidden mt-4">
              <div className="h-full bg-accent" style={{ width: `${achievementPct}%` }} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 text-sm">
              <MiniStat label="Achieved" value={money(achieved)} />
              <MiniStat label="Remaining" value={money(remaining!)} />
              <MiniStat label="Achievement" value={`${achievementPct!.toFixed(1)}%`} />
              <MiniStat label="Required Monthly Run Rate" value={money(requiredMonthlyRunRate!)} />
              <MiniStat label="Projected Year-End" value={projectedYearEnd !== null ? money(projectedYearEnd) : "—"} />
            </div>
          </>
        )}
      </section>

      {/* Commercial Opportunities */}
      <section className="bg-surface border border-border rounded-lg p-5 mt-6">
        <h2 className="text-sm font-medium text-foreground mb-3">Commercial Opportunities</h2>
        {closestOpportunities.length === 0 ? (
          <p className="text-sm text-muted">
            No AVR schemes entered yet, so no rebate-proximity opportunities to show.{" "}
            <Link href="/planning/settings/avr-schemes" className="text-accent underline">
              Add a supplier&apos;s real AVR slabs
            </Link>{" "}
            to see these.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {closestOpportunities.map((o) => (
              <div key={o.key} className="border border-amber-200 bg-amber-50 rounded-md p-3">
                <div className="text-xs font-medium text-[var(--warning)] uppercase tracking-wide">Opportunity</div>
                <p className="text-sm text-foreground mt-1">
                  {money(o.remaining)} additional eligible spend with <strong>{o.supplierName}</strong> ({o.category}) may
                  unlock the next AVR slab ({(Number(o.nextSlab!.rebatePct) * 100).toFixed(1)}%).
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Supplier AVR Tracker — bundled by supplier so a multi-category
          supplier (e.g. Elan's 6 categories) reads as one card, not a wall
          of repeated supplier-name rows. */}
      {avrProgress.length > 0 && (
        <section className="bg-surface border border-border rounded-lg p-5 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">Supplier AVR Tracker — {currentYear}</h2>
            <Link href="/planning/settings/avr-schemes" className="text-xs text-accent underline">
              Manage schemes
            </Link>
          </div>
          <div className="space-y-4">
            {Array.from(avrBySupplier.entries()).map(([supplierName, categories]) => (
              <div key={supplierName} className="border border-border rounded-md">
                <div className="px-3 py-2 border-b border-border bg-background flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{supplierName}</span>
                  <span className="text-xs text-muted">
                    {categories.length} categor{categories.length === 1 ? "y" : "ies"}
                  </span>
                </div>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {categories.map((a) => (
                      <tr key={a.key} className="border-b border-border last:border-0">
                        <td className="py-2 pl-3 pr-2 text-foreground whitespace-nowrap">{a.category}</td>
                        <td className="py-2 px-2 w-1/3">
                          <div className="h-1.5 rounded bg-border overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${a.progressPct}%` }} />
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-muted tabular-nums whitespace-nowrap text-xs">
                          {money(a.spend)} {a.nextSlab ? `/ ${money(Number(a.nextSlab.thresholdFrom))}` : "(max)"}
                        </td>
                        <td className="py-2 pl-2 pr-3 text-right text-xs text-muted whitespace-nowrap">
                          {a.currentSlab ? `${(Number(a.currentSlab.rebatePct) * 100).toFixed(1)}% AVR` : "Below 1st slab"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-3">
            Spend shown is total spend with the supplier (not split per category) — bookings aren&apos;t tagged to an
            AVR category yet.
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <RankingTable title="Client Performance" rows={topClients} hrefBase="/clients" />
        <RankingTable title="Supplier Performance" rows={topSuppliers} hrefBase="/suppliers" />
      </div>

      <p className="text-xs text-muted mt-6">
        Deeper discount/negotiation history and the campaign calendar are planned for a later pass — see{" "}
        <Link href="/planning/reports" className="text-accent underline">
          Reports
        </Link>{" "}
        for full spend breakdowns today.
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shrink-0">
          <Icon size={15} strokeWidth={1.75} className="text-accent" />
        </div>
        <div className="text-xs text-muted uppercase tracking-widest">{label}</div>
      </div>
      <div className="font-serif text-3xl text-foreground mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted mt-1.5">{hint}</div>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="font-medium text-foreground mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function SpendTrendChart({ series }: { series: Array<{ month: string; total: number }> }) {
  const hasData = series.some((s) => s.total > 0);
  if (!hasData) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-muted mt-4 border border-dashed border-border rounded-md">
        No spend recorded yet this year — this chart fills in as real media plans are booked.
      </div>
    );
  }

  const width = 600;
  const height = 160;
  const max = Math.max(...series.map((s) => s.total), 1);
  const stepX = width / (series.length - 1);
  const points = series.map((s, i) => ({ x: i * stepX, y: height - (s.total / max) * (height - 20) - 10 }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9A96A" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#C9A96A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#spendFill)" />
        <path d={linePath} fill="none" stroke="#C9A96A" strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={series[i].total > 0 ? 2.5 : 0} fill="#C9A96A" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        {MONTH_LABELS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

function MediaMixDonut({ breakdown, total }: { breakdown: Array<{ label: string; total: number; pct: number; color: string }>; total: number }) {
  const stops = breakdown.map((b, i) => {
    const start = breakdown.slice(0, i).reduce((sum, prev) => sum + prev.pct, 0);
    return `${b.color} ${start}% ${start + b.pct}%`;
  });

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-28 h-28 rounded-full shrink-0 relative"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      >
        <div className="absolute inset-3 rounded-full bg-surface flex flex-col items-center justify-center">
          <div className="text-[10px] text-muted uppercase tracking-wide">Total</div>
          <div className="text-xs font-semibold text-foreground tabular-nums">
            {total >= 1000 ? `${(total / 1000).toFixed(0)}K` : total.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="space-y-1.5 text-xs flex-1 min-w-0">
        {breakdown.map((b) => (
          <div key={b.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
              <span className="truncate text-foreground">{b.label}</span>
            </span>
            <span className="text-muted tabular-nums shrink-0">{b.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function RankingTable({ title, rows, hrefBase }: { title: string; rows: Array<{ label: string; total: number; count: number }>; hrefBase: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-sm font-medium text-foreground mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No spend recorded yet this year.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3">
                  <Link href={hrefBase} className="flex items-center gap-2 text-foreground hover:underline">
                    <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-[10px] font-semibold flex items-center justify-center shrink-0">
                      {initials(r.label)}
                    </span>
                    {r.label}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-right text-muted tabular-nums">{r.count} item(s)</td>
                <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{money(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Link href={hrefBase} className="text-xs text-accent underline mt-3 inline-block">
        View all →
      </Link>
    </div>
  );
}
