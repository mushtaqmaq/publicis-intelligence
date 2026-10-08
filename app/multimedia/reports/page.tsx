import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMultimediaUser } from "@/lib/auth/multimedia";
import { isOverdue } from "@/lib/multimedia/workflow";
import { PageHeader } from "@/components/ui/PageHeader";

const label = (s: string) => s.replace(/_/g, " ").toLowerCase();

export default async function ReportsPage() {
  await requireMultimediaUser();
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 864e5);
  const [byStatus, openJobs, tasks, bookings, deliveredRecent] = await Promise.all([
    prisma.multimediaJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.multimediaJob.findMany({ where: { status: { notIn: ["DELIVERED", "CANCELLED"] } }, select: { id: true, code: true, title: true, status: true, dueDate: true }, orderBy: { dueDate: "asc" } }),
    prisma.multimediaTask.findMany({ where: { job: { status: { notIn: ["DELIVERED", "CANCELLED"] } } }, select: { assigneeId: true, status: true, dueDate: true } }),
    prisma.resourceBooking.findMany({ where: { startsAt: { lt: in30 }, endsAt: { gt: now } }, include: { resource: { select: { name: true } } } }),
    prisma.multimediaJob.count({ where: { status: "DELIVERED", deliveredAt: { gte: new Date(now.getTime() - 30 * 864e5) } } }),
  ]);
  const overdue = openJobs.filter((j) => isOverdue(j.dueDate, j.status));
  const assignees = await prisma.user.findMany({ where: { id: { in: tasks.map((t) => t.assigneeId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const perPerson = new Map<string, { open: number; blocked: number; late: number }>();
  for (const t of tasks) {
    if (!t.assigneeId || t.status === "DONE") continue;
    const p = perPerson.get(t.assigneeId) ?? { open: 0, blocked: 0, late: 0 };
    p.open++; if (t.status === "BLOCKED") p.blocked++; if (t.dueDate && t.dueDate < now) p.late++;
    perPerson.set(t.assigneeId, p);
  }
  const hours = new Map<string, number>();
  for (const b of bookings) { const s = Math.max(b.startsAt.getTime(), now.getTime()), e = Math.min(b.endsAt.getTime(), in30.getTime()); hours.set(b.resource.name, (hours.get(b.resource.name) ?? 0) + Math.max(0, e - s) / 36e5); }
  const card = "bg-surface border border-border rounded-lg p-5";
  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Multimedia reports" subtitle="Status, deadlines, workload and resource use." />
      <div className="mt-6 grid grid-cols-2 gap-4">
        <section className={card}><h2 className="font-medium">Jobs by status</h2>
          <table className="w-full text-sm mt-2"><tbody>{byStatus.map((s) => <tr key={s.status}><td className="py-1">{label(s.status)}</td><td className="py-1 text-right tabular-nums">{s._count._all}</td></tr>)}</tbody></table>
          <p className="text-xs text-muted mt-2">{deliveredRecent} delivered in the last 30 days.</p></section>
        <section className={card}><h2 className="font-medium">Overdue jobs ({overdue.length})</h2>
          <ul className="text-sm mt-2">{overdue.map((j) => <li key={j.id}><Link href={`/multimedia/${j.id}`} className="text-accent">{j.code} {j.title}</Link> <span className="text-muted">due {j.dueDate!.toISOString().slice(0, 10)} · {label(j.status)}</span></li>)}{overdue.length === 0 && <li className="text-muted">None.</li>}</ul></section>
        <section className={card}><h2 className="font-medium">Open tasks by person</h2>
          <table className="w-full text-sm mt-2"><thead><tr className="text-xs text-muted text-left"><th className="font-medium">Person</th><th className="font-medium text-right">Open</th><th className="font-medium text-right">Blocked</th><th className="font-medium text-right">Late</th></tr></thead>
            <tbody>{[...perPerson.entries()].map(([id, p]) => { const u = assignees.find((a) => a.id === id); return <tr key={id}><td className="py-1">{u ? (u.name ?? u.email) : id}</td><td className="text-right tabular-nums">{p.open}</td><td className="text-right tabular-nums">{p.blocked}</td><td className="text-right tabular-nums">{p.late}</td></tr>; })}</tbody></table>
          {perPerson.size === 0 && <p className="text-sm text-muted mt-2">No open tasks.</p>}</section>
        <section className={card}><h2 className="font-medium">Resource hours booked, next 30 days</h2>
          <table className="w-full text-sm mt-2"><tbody>{[...hours.entries()].sort((a, b) => b[1] - a[1]).map(([n, h]) => <tr key={n}><td className="py-1">{n}</td><td className="py-1 text-right tabular-nums">{h.toFixed(1)} h</td></tr>)}</tbody></table>
          {hours.size === 0 && <p className="text-sm text-muted mt-2">Nothing booked.</p>}</section>
      </div>
    </div>
  );
}
