import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { MediaPlanStatus } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireMediaUser } from "@/lib/auth/modules";
import { deleteMediaPlanAction } from "./[planId]/actions";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: MediaPlanStatus[] = [
  "DRAFT",
  "PLANNING",
  "INTERNAL_REVIEW",
  "CLIENT_SHARED",
  "APPROVED",
  "AWAITING_ARTWORK",
  "BOOKED",
  "SCHEDULED",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
];

function yearOptions() {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>();
  for (let y = currentYear - 2; y <= currentYear + 2; y++) years.add(y);
  return Array.from(years).sort((a, b) => b - a);
}

export default async function MediaPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; year?: string }>;
}) {
  const user = await requireMediaUser("plans");
  const canDelete = user.role === "SUPER_ADMIN";

  const { status: statusParam, year: yearParam } = await searchParams;
  const status = statusParam && (STATUS_OPTIONS as string[]).includes(statusParam) ? (statusParam as MediaPlanStatus) : undefined;
  const year = yearParam && Number.isFinite(Number(yearParam)) ? Number(yearParam) : undefined;

  const plans = await prisma.mediaPlan.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(year
        ? {
            campaignEnd: {
              gte: new Date(Date.UTC(year, 0, 1)),
              lt: new Date(Date.UTC(year + 1, 0, 1)),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { items: { select: { lineTotal: true } } },
      },
    },
  });

  const exportQuery = new URLSearchParams();
  if (status) exportQuery.set("status", status);
  if (year) exportQuery.set("year", String(year));
  const exportQueryString = exportQuery.toString();

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Media Plans"
        subtitle={`${plans.length} plan(s)`}
        actions={
          <>
            <Link href="/media/settings/import-media-plans" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
              Import Ended Plans
            </Link>
            <Link href="/media/plans/new" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
              + New Media Plan
            </Link>
          </>
        }
      />

      <div className="flex items-end justify-between gap-3 mt-6 flex-wrap">
        <form className="flex items-end gap-3" method="get">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Status</label>
            <select name="status" defaultValue={status ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Completed in year</label>
            <select name="year" defaultValue={year ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="">All years</option>
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium">
            Filter
          </button>
          {(status || year) && (
            <Link href="/media/plans" className="text-xs text-muted underline pb-2">
              Clear
            </Link>
          )}
        </form>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">Export list</span>
          <a
            href={`/media/plans/export?format=xlsx${exportQueryString ? `&${exportQueryString}` : ""}`}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium"
          >
            Excel
          </a>
          <a
            href={`/media/plans/export?format=pdf${exportQueryString ? `&${exportQueryString}` : ""}`}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium"
          >
            PDF
          </a>
        </div>
      </div>

      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Campaign</th>
            <th className="py-2 pr-4 font-medium">Client</th>
            <th className="py-2 pr-4 font-medium">Dates</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium text-right">Assets</th>
            <th className="py-2 pr-4 font-medium text-right">Total</th>
            {canDelete && <th className="py-2 pr-4 font-medium"></th>}
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => {
            const version = plan.versions[0];
            const total = version.items.reduce((sum, i) => sum + (i.lineTotal ? Number(i.lineTotal) : 0), 0);
            return (
              <tr key={plan.id} className="border-b border-border hover:bg-background">
                <td className="py-2 pr-4">
                  <Link href={`/media/plans/${plan.id}`} className="font-medium text-foreground hover:underline">
                    {plan.campaignName}
                  </Link>
                  <div className="text-xs text-muted">{plan.planCode}</div>
                </td>
                <td className="py-2 pr-4">{plan.client.name}</td>
                <td className="py-2 pr-4 text-xs text-muted">
                  {plan.campaignStart.toISOString().slice(0, 10)} → {plan.campaignEnd.toISOString().slice(0, 10)}
                </td>
                <td className="py-2 pr-4">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200">
                    {plan.status}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{version.items.length}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {plan.currency} {total.toLocaleString()}
                </td>
                {canDelete && (
                  <td className="py-2 pr-4 text-right">
                    <form action={deleteMediaPlanAction}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <button type="submit" className="text-xs text-[var(--danger)] underline">
                        Delete
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {plans.length === 0 && (
        <div className="text-center text-muted text-sm py-16">
          {status || year ? "No media plans match these filters." : "No media plans yet."}
        </div>
      )}
    </div>
  );
}
