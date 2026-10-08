import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCreativeUser } from "@/lib/auth/creative";
import { isOverdue, type CStatus } from "@/lib/creative/workflow";
import { PageHeader } from "@/components/ui/PageHeader";

const STATUSES: CStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "DELIVERED", "CANCELLED"];
const label = (s: string) => s.replace(/_/g, " ").toLowerCase();

export default async function CreativeHome({ searchParams }: { searchParams: Promise<{ view?: string; status?: string }> }) {
  const { user } = await requireCreativeUser();
  const { view = "all", status } = await searchParams;
  const where = {
    ...(view === "mine" ? { assigneeId: user.id } : view === "asked" ? { requestedById: user.id } : view === "review" ? { reviewerId: user.id, status: "IN_REVIEW" as const } : {}),
    ...(status && (STATUSES as string[]).includes(status) ? { status: status as CStatus } : view === "all" || view === "mine" || view === "asked" ? { status: { notIn: ["DELIVERED", "CANCELLED"] as CStatus[] } } : {}),
  };
  const rows = await prisma.creativeRequest.findMany({ where, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 200, include: { client: { select: { name: true } } } });
  const people = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.assigneeId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const nm = (id: string | null) => { const p = people.find((x) => x.id === id); return p ? (p.name ?? p.email) : "Unassigned"; };
  const tab = (v: string, t: string) => <Link key={v} href={`/creative?view=${v}`} className={`px-3 py-1.5 rounded-md text-sm ${view === v ? "bg-foreground text-white" : "text-muted hover:bg-black/5"}`}>{t}</Link>;
  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title="Creative requests" subtitle="From brief to final artwork. Briefs and artwork are links to your own storage." actions={<Link href="/creative/new" className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">New request</Link>} />
      <div className="mt-5 flex flex-wrap gap-1">{tab("all", "Open")}{tab("mine", "Mine to do")}{tab("asked", "I asked for")}{tab("review", "To review")}{tab("closed", "Delivered / cancelled")}</div>
      <table className="w-full text-sm border-collapse mt-4">
        <thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
          <th className="py-2 pr-4 font-medium">Code</th><th className="py-2 pr-4 font-medium">Request</th><th className="py-2 pr-4 font-medium">Client</th><th className="py-2 pr-4 font-medium">Designer</th><th className="py-2 pr-4 font-medium">Due</th><th className="py-2 pr-4 font-medium">Status</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border">
              <td className="py-2 pr-4 tabular-nums text-muted">{r.code}</td>
              <td className="py-2 pr-4 font-medium"><Link href={`/creative/${r.id}`} className="text-accent">{r.title}</Link>{r.priority === "URGENT" || r.priority === "HIGH" ? <span className="ml-2 text-xs text-[var(--danger)]">{r.priority.toLowerCase()}</span> : null}</td>
              <td className="py-2 pr-4">{r.client.name}</td>
              <td className="py-2 pr-4">{nm(r.assigneeId)}</td>
              <td className={`py-2 pr-4 tabular-nums ${isOverdue(r.dueDate, r.status) ? "text-[var(--danger)] font-medium" : ""}`}>{r.dueDate ? r.dueDate.toISOString().slice(0, 10) : "—"}</td>
              <td className="py-2 pr-4 text-muted">{label(r.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-sm text-muted mt-6">Nothing here.</p>}
    </div>
  );
}
