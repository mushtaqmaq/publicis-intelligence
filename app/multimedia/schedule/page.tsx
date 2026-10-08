import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMultimediaUser } from "@/lib/auth/multimedia";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function SchedulePage() {
  await requireMultimediaUser();
  const from = new Date(); from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 21 * 864e5);
  const [jobs, bookings] = await Promise.all([
    prisma.multimediaJob.findMany({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, startsAt: { lt: to }, endsAt: { gte: from } }, orderBy: { startsAt: "asc" }, include: { client: { select: { name: true } } } }),
    prisma.resourceBooking.findMany({ where: { startsAt: { lt: to }, endsAt: { gte: from }, job: { status: { notIn: ["CANCELLED"] } } }, orderBy: { startsAt: "asc" }, include: { resource: { select: { name: true, kind: true } }, job: { select: { id: true, code: true, title: true } } } }),
  ]);
  const days = Array.from({ length: 21 }, (_, i) => new Date(from.getTime() + i * 864e5));
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const hit = (s: Date, e: Date, d: Date) => s.getTime() < d.getTime() + 864e5 && e.getTime() > d.getTime();
  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Schedule" subtitle="Next three weeks (times are UTC)." />
      <div className="mt-6 space-y-3">
        {days.map((d) => {
          const js = jobs.filter((j) => j.startsAt && j.endsAt && hit(j.startsAt, j.endsAt, d));
          const bs = bookings.filter((b) => hit(b.startsAt, b.endsAt, d));
          if (!js.length && !bs.length) return null;
          return (
            <div key={day(d)} className="bg-surface border border-border rounded-lg p-4 text-sm">
              <div className="font-medium">{d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}</div>
              {js.map((j) => <div key={j.id} className="mt-1"><Link href={`/multimedia/${j.id}`} className="text-accent">{j.code} {j.title}</Link> <span className="text-muted">{j.client.name}{j.location ? ` · ${j.location}` : ""}</span></div>)}
              {bs.map((b) => <div key={b.id} className="text-xs text-muted">{b.resource.name} ({b.resource.kind.toLowerCase()}) {b.startsAt.toISOString().slice(11, 16)}–{b.endsAt.toISOString().slice(11, 16)} · <Link href={`/multimedia/${b.job.id}`} className="text-accent">{b.job.code}</Link></div>)}
            </div>
          );
        })}
        {jobs.length === 0 && bookings.length === 0 && <p className="text-sm text-muted">Nothing scheduled in the next three weeks.</p>}
      </div>
    </div>
  );
}
