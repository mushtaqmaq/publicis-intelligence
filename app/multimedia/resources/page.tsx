import { prisma } from "@/lib/prisma";
import { requireMultimediaUser } from "@/lib/auth/multimedia";
import { RESOURCE_KINDS } from "@/lib/multimedia/workflow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { createResourceAction, toggleResourceAction } from "../actions";

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { actor } = await requireMultimediaUser();
  const { error, ok } = await searchParams;
  const resources = await prisma.resource.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }], include: { bookings: { where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 3, include: { job: { select: { code: true, title: true } } } } } });
  return (
    <div className="p-8 max-w-4xl">
      <PageHeader title="Resources" subtitle="Crew, equipment, locations, studios and talent. A resource can only be booked once at any time." />
      <Banner error={error} ok={ok} />
      {actor.manager && (
        <form action={createResourceAction} className="mt-6 grid grid-cols-[2fr_1fr_2fr_auto] gap-2 items-end bg-surface border border-border rounded-lg p-4">
          <div><label className={labelCls}>New resource</label><input name="name" required maxLength={120} className={field} /></div>
          <div><label className={labelCls}>Kind</label><select name="kind" className={field}>{RESOURCE_KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}</select></div>
          <div><label className={labelCls}>Notes</label><input name="notes" maxLength={300} className={field} /></div>
          <button className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">Add</button>
        </form>
      )}
      <table className="w-full text-sm border-collapse mt-6">
        <thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border"><th className="py-2 pr-4 font-medium">Resource</th><th className="py-2 pr-4 font-medium">Kind</th><th className="py-2 pr-4 font-medium">Next bookings</th><th className="py-2 font-medium" /></tr></thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.id} className={`border-b border-border ${r.isActive ? "" : "opacity-50"}`}>
              <td className="py-2 pr-4 font-medium">{r.name}{r.notes ? <div className="text-xs text-muted font-normal">{r.notes}</div> : null}</td>
              <td className="py-2 pr-4 text-muted">{r.kind.toLowerCase()}</td>
              <td className="py-2 pr-4 text-xs">{r.bookings.map((b) => <div key={b.id}>{b.startsAt.toISOString().slice(0, 16).replace("T", " ")} · {b.job.code} {b.job.title}</div>)}{r.bookings.length === 0 && <span className="text-muted">free</span>}</td>
              <td className="py-2 text-right">{actor.manager && <form action={toggleResourceAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="active" value={r.isActive ? "0" : "1"} /><button className="text-xs text-accent underline">{r.isActive ? "Disable" : "Enable"}</button></form>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {resources.length === 0 && <p className="text-sm text-muted mt-6">No resources yet.</p>}
    </div>
  );
}
