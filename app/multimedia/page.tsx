import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMultimediaUser } from "@/lib/auth/multimedia";
import { isOverdue, type MStatus } from "@/lib/multimedia/workflow";
import { PageHeader } from "@/components/ui/PageHeader";

const label = (s: string) => s.replace(/_/g, " ").toLowerCase();

export default async function MultimediaHome({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { user } = await requireMultimediaUser();
  const { view = "all" } = await searchParams;
  const open = { notIn: ["DELIVERED", "CANCELLED"] as MStatus[] };
  const where = view === "mine" ? { producerId: user.id, status: open } : view === "asked" ? { requestedById: user.id, status: open }
    : view === "review" ? { reviewerId: user.id, status: "IN_REVIEW" as MStatus } : view === "closed" ? { status: { in: ["DELIVERED", "CANCELLED"] as MStatus[] } } : { status: open };
  const rows = await prisma.multimediaJob.findMany({ where, orderBy: [{ startsAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 200, include: { client: { select: { name: true } }, tasks: { select: { status: true } } } });
  const people = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.producerId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const nm = (id: string | null) => { const p = people.find((x) => x.id === id); return p ? (p.name ?? p.email) : "No producer"; };
  const tab = (v: string, t: string) => <Link key={v} href={`/multimedia?view=${v}`} className={`px-3 py-1.5 rounded-md text-sm ${view === v ? "bg-foreground text-white" : "text-muted hover:bg-black/5"}`}>{t}</Link>;
  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title="Multimedia jobs" subtitle="Photo and video shoots, voice-over, editing and post-production." actions={<Link href="/multimedia/new" className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">New job</Link>} />
      <div className="mt-5 flex flex-wrap gap-1">{tab("all", "Open")}{tab("mine", "I produce")}{tab("asked", "I asked for")}{tab("review", "To review")}{tab("closed", "Delivered / cancelled")}</div>
      <table className="w-full text-sm border-collapse mt-4">
        <thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
          <th className="py-2 pr-4 font-medium">Code</th><th className="py-2 pr-4 font-medium">Job</th><th className="py-2 pr-4 font-medium">Client</th><th className="py-2 pr-4 font-medium">Producer</th><th className="py-2 pr-4 font-medium">Shoot / work</th><th className="py-2 pr-4 font-medium">Tasks</th><th className="py-2 pr-4 font-medium">Status</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border">
              <td className="py-2 pr-4 tabular-nums text-muted">{r.code}</td>
              <td className="py-2 pr-4 font-medium"><Link href={`/multimedia/${r.id}`} className="text-accent">{r.title}</Link><span className="ml-2 text-xs text-muted">{label(r.jobType)}</span></td>
              <td className="py-2 pr-4">{r.client.name}</td>
              <td className="py-2 pr-4">{nm(r.producerId)}</td>
              <td className={`py-2 pr-4 tabular-nums ${isOverdue(r.dueDate, r.status) ? "text-[var(--danger)] font-medium" : ""}`}>{r.startsAt ? r.startsAt.toISOString().slice(0, 16).replace("T", " ") : "not scheduled"}{r.dueDate ? ` · due ${r.dueDate.toISOString().slice(0, 10)}` : ""}</td>
              <td className="py-2 pr-4 tabular-nums text-muted">{r.tasks.filter((t) => t.status === "DONE").length}/{r.tasks.length}</td>
              <td className="py-2 pr-4 text-muted">{label(r.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-sm text-muted mt-6">Nothing here.</p>}
    </div>
  );
}
