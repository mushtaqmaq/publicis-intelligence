import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function MediaPlannerDashboard({ user }: { user: SessionUser }) {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const plans = await prisma.mediaPlan.findMany({
    where: { createdById: user.id, status: { not: "CANCELLED" } },
    include: { client: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const inProgress = plans.filter((p) => ["DRAFT", "PLANNING", "INTERNAL_REVIEW"].includes(p.status));
  const bookingsPending = plans.filter((p) => p.boPoStatus === "PENDING" || p.supplierConfirmationStatus === "PENDING");
  const launchingThisWeek = plans.filter((p) => p.campaignStart >= now && p.campaignStart <= in7Days);
  const artworkPending = plans.filter((p) => p.artworkStatus === "NOT_SUBMITTED" || p.artworkStatus === "SUBMITTED");
  const awaitingApproval = plans.filter((p) => p.status === "CLIENT_SHARED" || p.status === "INTERNAL_REVIEW");

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader eyebrow="Dashboard" title={`Welcome back, ${user.name ?? user.email}.`} subtitle="Your media planning workspace." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <StatCard label="Plans in Progress" value={inProgress.length} />
        <StatCard label="Bookings Pending" value={bookingsPending.length} />
        <StatCard label="Launching This Week" value={launchingThisWeek.length} />
        <StatCard label="Artwork Pending" value={artworkPending.length} />
      </div>

      <section className="bg-surface border border-border rounded-lg p-5 mt-6">
        <h2 className="text-sm font-medium text-foreground mb-3">Media Plans Awaiting Approval</h2>
        {awaitingApproval.length === 0 ? (
          <p className="text-sm text-muted">Nothing awaiting approval right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {awaitingApproval.map((p) => (
              <li key={p.id} className="text-sm">
                <Link href={`/media/media-plans/${p.id}`} className="text-accent underline">
                  {p.campaignName}
                </Link>{" "}
                <span className="text-muted">— {p.client.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">My Media Plans</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4 font-medium">Campaign</th>
              <th className="py-2 pr-4 font-medium">Client</th>
              <th className="py-2 pr-4 font-medium">Budget</th>
              <th className="py-2 pr-4 font-medium">Duration</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <Link href={`/media/media-plans/${p.id}`} className="font-medium text-foreground hover:underline">
                    {p.campaignName}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-muted">{p.client.name}</td>
                <td className="py-2 pr-4 tabular-nums">{p.budget ? `${p.currency} ${Number(p.budget).toLocaleString()}` : "—"}</td>
                <td className="py-2 pr-4 text-xs text-muted">
                  {fmtDate(p.campaignStart)} → {fmtDate(p.campaignEnd)}
                </td>
                <td className="py-2 pr-4">
                  <StatusChip label={p.status.replace(/_/g, " ")} tone="neutral" />
                </td>
                <td className="py-2 pr-4 text-xs text-muted">{fmtDate(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plans.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            No media plans yet. <Link href="/media/new-media-plan" className="text-accent underline">Create one →</Link>
          </div>
        )}
      </section>

      <section className="mt-6 bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-foreground mb-2">Inventory Search</h2>
        <p className="text-sm text-muted mb-3">Search suppliers, media types, areas, and availability across every channel.</p>
        <Link href="/media/inventory" className="inline-block rounded-md bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium">
          Open Inventory →
        </Link>
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
