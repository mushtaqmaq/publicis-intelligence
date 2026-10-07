import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLANNING: "Planning",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_SHARED: "Awaiting Client Approval",
  APPROVED: "Approved",
  AWAITING_ARTWORK: "Awaiting Artwork",
  BOOKED: "Booked",
  SCHEDULED: "Scheduled",
  LIVE: "Live",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const ACTIVE_STATUSES = ["APPROVED", "AWAITING_ARTWORK", "BOOKED", "SCHEDULED", "LIVE"];

export async function AccountManagerDashboard({ user }: { user: SessionUser }) {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const clients = await prisma.client.findMany({
    where: { accountManagerId: user.id },
    include: {
      mediaPlans: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { campaignStart: "desc" },
        select: {
          id: true,
          campaignName: true,
          status: true,
          campaignStart: true,
          campaignEnd: true,
          budget: true,
          currency: true,
          artworkStatus: true,
          boPoStatus: true,
          supplierConfirmationStatus: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const allPlans = clients.flatMap((c) => c.mediaPlans.map((p) => ({ ...p, clientName: c.name })));
  const activeCampaigns = allPlans.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const upcomingCampaigns = allPlans.filter((p) => p.campaignStart > now);
  const pendingApprovals = allPlans.filter((p) => p.status === "CLIENT_SHARED");

  const pendingActions: Array<{ text: string; severity: "critical" | "attention" }> = [];
  for (const p of allPlans) {
    const startsSoon = p.campaignStart <= in7Days && p.campaignStart >= now;
    if (startsSoon && p.artworkStatus !== "APPROVED") {
      pendingActions.push({
        text: `${p.campaignName} (${p.clientName}) launches ${fmtDate(p.campaignStart)} — artwork is ${(p.artworkStatus ?? "not submitted").toLowerCase().replace(/_/g, " ")}.`,
        severity: p.artworkStatus === null || p.artworkStatus === "NOT_SUBMITTED" ? "critical" : "attention",
      });
    }
    if (startsSoon && p.supplierConfirmationStatus !== "CONFIRMED") {
      pendingActions.push({
        text: `${p.campaignName} (${p.clientName}) launches ${fmtDate(p.campaignStart)} — supplier confirmation is ${(p.supplierConfirmationStatus ?? "pending").toLowerCase()}.`,
        severity: "attention",
      });
    }
    if (p.status === "CLIENT_SHARED") {
      pendingActions.push({ text: `${p.campaignName} (${p.clientName}) is awaiting client approval.`, severity: "attention" });
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader eyebrow="Dashboard" title={`Welcome back, ${user.name ?? user.email}.`} subtitle="Your assigned clients and campaigns." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <StatCard label="Assigned Clients" value={clients.length} />
        <StatCard label="Active Campaigns" value={activeCampaigns.length} />
        <StatCard label="Upcoming Campaigns" value={upcomingCampaigns.length} />
        <StatCard label="Pending Approvals" value={pendingApprovals.length} />
      </div>

      <section className="bg-surface border border-border rounded-lg p-5 mt-6">
        <h2 className="text-sm font-medium text-foreground mb-3">Pending Actions</h2>
        {pendingActions.length === 0 ? (
          <p className="text-sm text-muted">Nothing needs your attention right now.</p>
        ) : (
          <div className="space-y-2">
            {pendingActions.map((a, i) => (
              <div
                key={i}
                className={`text-sm px-3 py-2 rounded border ${
                  a.severity === "critical" ? "bg-red-50 border-red-200 text-[var(--danger)]" : "bg-amber-50 border-amber-200 text-[var(--warning)]"
                }`}
              >
                {a.text}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">My Clients</h2>
        {clients.length === 0 ? (
          <p className="text-sm text-muted">No clients assigned to you yet — ask an Admin to assign one.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clients.map((c) => (
              <div key={c.id} className="bg-surface border border-border rounded-lg p-4">
                <div className="font-medium text-foreground">{c.name}</div>
                <div className="text-xs text-muted mt-1">{c.mediaPlans.length} active campaign(s)</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">Campaign Tracker</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4 font-medium">Campaign</th>
              <th className="py-2 pr-4 font-medium">Client</th>
              <th className="py-2 pr-4 font-medium">Dates</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Artwork</th>
              <th className="py-2 pr-4 font-medium">BO/PO</th>
              <th className="py-2 pr-4 font-medium">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {allPlans.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <Link href={`/media/media-plans/${p.id}`} className="font-medium text-foreground hover:underline">
                    {p.campaignName}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-muted">{p.clientName}</td>
                <td className="py-2 pr-4 text-xs text-muted">
                  {fmtDate(p.campaignStart)} → {fmtDate(p.campaignEnd)}
                </td>
                <td className="py-2 pr-4">
                  <StatusChip label={STATUS_LABEL[p.status] ?? p.status} tone="neutral" />
                </td>
                <td className="py-2 pr-4 text-xs text-muted">{p.artworkStatus?.replace(/_/g, " ") ?? "—"}</td>
                <td className="py-2 pr-4 text-xs text-muted">{p.boPoStatus?.replace(/_/g, " ") ?? "—"}</td>
                <td className="py-2 pr-4 text-xs text-muted">{p.supplierConfirmationStatus?.replace(/_/g, " ") ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {allPlans.length === 0 && <p className="text-sm text-muted py-8 text-center">No campaigns yet for your clients.</p>}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-xs text-muted uppercase tracking-widest">{label}</div>
      <div className="font-serif text-3xl text-foreground mt-1.5 tabular-nums">{value}</div>
    </div>
  );
}
