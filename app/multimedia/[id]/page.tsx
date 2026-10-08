import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMultimediaUser, multimediaStaff } from "@/lib/auth/multimedia";
import * as wf from "@/lib/multimedia/workflow";
import { LINK_KINDS } from "@/lib/core/links";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { addRefLinkAction, addTaskAction, bookAction, cancelJobAction, commentAction, deliverAction, removeRefLinkAction, scheduleAction, setProducerAction, startAction, submitVersionAction, taskStatusAction, unbookAction } from "./actions";

const label = (s: string) => s.replace(/_/g, " ").toLowerCase();
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const fmtT = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");
const local = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");
const btn = "rounded-md bg-foreground px-3 py-1.5 text-sm text-white";

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { user, actor } = await requireMultimediaUser();
  const [{ id }, { error, ok }] = await Promise.all([params, searchParams]);
  const j = await prisma.multimediaJob.findUnique({ where: { id }, include: { client: true, campaign: { select: { id: true, code: true, name: true } }, deliverable: { select: { title: true } }, creativeRequest: { select: { id: true, code: true, title: true } }, versions: { orderBy: { versionNo: "desc" } }, tasks: { orderBy: { createdAt: "asc" } }, bookings: { orderBy: { startsAt: "asc" }, include: { resource: true } } } });
  if (!j) notFound();
  const w = { id: user.id, manager: actor.manager };
  const shape = { status: j.status, requestedById: j.requestedById, producerId: j.producerId, reviewerId: j.reviewerId };
  const planner = wf.canPlan(shape, w);
  const [links, comments, staff, resources] = await Promise.all([
    prisma.link.findMany({ where: { entityType: "MultimediaJob", entityId: id }, orderBy: { createdAt: "asc" } }),
    prisma.comment.findMany({ where: { entityType: "MultimediaJob", entityId: id }, orderBy: { createdAt: "asc" } }),
    planner ? multimediaStaff() : Promise.resolve([]),
    planner ? prisma.resource.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }) : Promise.resolve([]),
  ]);
  const uids = [j.producerId, j.reviewerId, j.requestedById, ...comments.map((c) => c.authorId), ...j.tasks.map((t) => t.assigneeId)].filter((x): x is string => !!x);
  const people = await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, name: true, email: true } });
  const nm = (uid: string | null) => { const p = people.find((x) => x.id === uid); return p ? (p.name ?? p.email) : "—"; };
  const prog = wf.taskProgress(j.tasks);
  const card = "mt-6 bg-surface border border-border rounded-lg p-5";
  const hid = <input type="hidden" name="id" value={j.id} />;
  const personSel = (name: string, def: string | null, blank: string) => <select name={name} defaultValue={def ?? ""} className={field}><option value="">{blank}</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</select>;

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader eyebrow={`${j.code} · ${label(j.jobType)}`} title={j.title} subtitle={`${j.client.name} · ${label(j.status)} · due ${fmt(j.dueDate)}`} />
      <Banner error={error} ok={ok} />
      <div className="mt-4 text-sm text-muted">
        Asked by {nm(j.requestedById)} · Producer: {nm(j.producerId)} · Reviewer: {j.reviewerId ? nm(j.reviewerId) : "set by approval steps"}
        {j.location && <> · Location: {j.location}</>} · Window: {fmtT(j.startsAt)} to {fmtT(j.endsAt)} UTC
        {j.campaign && <> · Campaign: <Link href={`/campaigns/${j.campaign.id}`} className="text-accent">{j.campaign.code} {j.campaign.name}</Link></>}
        {j.deliverable && <> · Deliverable: {j.deliverable.title}</>}
        {j.creativeRequest && <> · Creative: <Link href={`/creative/${j.creativeRequest.id}`} className="text-accent">{j.creativeRequest.code} {j.creativeRequest.title}</Link></>}
      </div>
      <p className="mt-4 text-sm whitespace-pre-wrap">{j.brief}</p>

      <section className={card}>
        <h2 className="font-medium">Next step</h2>
        <div className="mt-3 flex flex-wrap gap-3 items-start">
          {wf.canStart(shape, w) && <form action={startAction}>{hid}<button className={btn}>Start work</button></form>}
          {wf.canDeliver(shape, w) && <form action={deliverAction} className="flex gap-2 items-end">{hid}<input name="note" placeholder="Delivery note (optional)" className={field} /><button className={btn}>Mark delivered</button></form>}
          {wf.canCancel(shape, w) && <form action={cancelJobAction}>{hid}<button className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel job</button></form>}
          {j.status === "PLANNED" && <p className="text-sm text-muted">Choose a producer and schedule the job.</p>}
          {j.status === "IN_REVIEW" && <p className="text-sm text-muted">Waiting for review. The reviewer decides on the Approvals page.</p>}
          {j.status === "DELIVERED" && <p className="text-sm text-muted">Delivered {fmt(j.deliveredAt)}{j.deliveryNote ? `: ${j.deliveryNote}` : ""}</p>}
        </div>
        {wf.canSubmit(shape, w) && (
          <form action={submitVersionAction} className="mt-4 grid grid-cols-[2fr_2fr_auto] gap-2 items-end">{hid}
            <div><label className={labelCls}>Link to the cut / audio / photo set</label><input name="url" required placeholder="https://" className={field} /></div>
            <div><label className={labelCls}>What changed</label><input name="notes" maxLength={500} className={field} /></div>
            <button className={btn}>Send for review</button>
          </form>
        )}
      </section>

      {planner && (
        <section className={card}>
          <h2 className="font-medium">Producer and schedule</h2>
          <form action={setProducerAction} className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">{hid}
            <div><label className={labelCls}>Producer</label>{personSel("producerId", j.producerId, "Choose")}</div>
            <div><label className={labelCls}>Reviewer</label>{personSel("reviewerId", j.reviewerId, "Use approval steps")}</div>
            <button className={btn}>Save</button>
          </form>
          {wf.canSchedule(shape, w) && (
            <form action={scheduleAction} className="mt-4 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">{hid}
              <div><label className={labelCls}>Starts (UTC)</label><input type="datetime-local" name="startsAt" required defaultValue={local(j.startsAt)} className={field} /></div>
              <div><label className={labelCls}>Ends (UTC)</label><input type="datetime-local" name="endsAt" required defaultValue={local(j.endsAt)} className={field} /></div>
              <div><label className={labelCls}>Location</label><input name="location" defaultValue={j.location ?? ""} maxLength={200} className={field} /></div>
              <button className={btn}>{j.status === "SCHEDULED" ? "Reschedule" : "Schedule"}</button>
            </form>
          )}
        </section>
      )}

      <section className={card}>
        <div className="flex items-center"><h2 className="font-medium">Tasks</h2><span className="ml-auto text-sm text-muted">{prog.done}/{prog.total} done ({prog.pct}%)</span></div>
        <ul className="mt-3 divide-y divide-border text-sm">
          {j.tasks.map((t) => (
            <li key={t.id} className="py-2 flex items-center gap-3">
              <span className={t.status === "DONE" ? "line-through text-muted" : "font-medium"}>{t.title}</span>
              <span className="text-muted">{nm(t.assigneeId)}{t.dueDate ? ` · due ${fmt(t.dueDate)}` : ""}</span>
              <form action={taskStatusAction} className="ml-auto flex gap-1">{hid}<input type="hidden" name="taskId" value={t.id} />
                <select name="status" defaultValue={t.status} className="text-xs rounded border border-border bg-background px-1.5 py-0.5">{wf.TASK_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>
                <button className="text-xs text-accent underline">Save</button></form>
            </li>
          ))}
          {j.tasks.length === 0 && <li className="py-2 text-muted">No tasks yet.</li>}
        </ul>
        {planner && (
          <form action={addTaskAction} className="mt-3 grid grid-cols-[2fr_1.5fr_1fr_auto] gap-2 items-end">{hid}
            <div><label className={labelCls}>Task</label><input name="title" required maxLength={200} className={field} /></div>
            <div><label className={labelCls}>Assignee</label>{personSel("assigneeId", null, "Unassigned")}</div>
            <div><label className={labelCls}>Due</label><input type="date" name="dueDate" className={field} /></div>
            <button className={btn}>Add</button>
          </form>
        )}
      </section>

      <section className={card}>
        <h2 className="font-medium">Resources</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {j.bookings.map((b) => (
            <li key={b.id} className="py-2 flex items-center gap-3"><span className="font-medium">{b.resource.name}</span><span className="text-muted">{b.resource.kind.toLowerCase()} · {fmtT(b.startsAt)} to {fmtT(b.endsAt)}{b.note ? ` · ${b.note}` : ""}</span>
              {planner && <form action={unbookAction} className="ml-auto">{hid}<input type="hidden" name="bookingId" value={b.id} /><button className="text-xs text-muted underline">Remove</button></form>}</li>
          ))}
          {j.bookings.length === 0 && <li className="py-2 text-muted">Nothing booked.</li>}
        </ul>
        {planner && (
          <form action={bookAction} className="mt-3 grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-2 items-end">{hid}
            <div><label className={labelCls}>Resource</label><select name="resourceId" required className={field}><option value="">Choose</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.kind.toLowerCase()})</option>)}</select></div>
            <div><label className={labelCls}>From (UTC)</label><input type="datetime-local" name="startsAt" required defaultValue={local(j.startsAt)} className={field} /></div>
            <div><label className={labelCls}>To (UTC)</label><input type="datetime-local" name="endsAt" required defaultValue={local(j.endsAt)} className={field} /></div>
            <div><label className={labelCls}>Note</label><input name="note" maxLength={200} className={field} /></div>
            <button className={btn}>Book</button>
          </form>
        )}
      </section>

      <section className={card}>
        <h2 className="font-medium">Versions and revision history</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {j.versions.map((v) => (
            <li key={v.id} className="py-2">
              <div className="flex gap-3 items-center"><span className="font-medium">v{v.versionNo}</span><a href={v.url} target="_blank" rel="noopener noreferrer" className="text-accent truncate">{v.url}</a><span className="ml-auto text-muted">{label(v.status)}</span></div>
              <div className="text-xs text-muted">{nm(v.submittedById)} · {fmt(v.createdAt)}{v.notes ? ` · ${v.notes}` : ""}</div>
              {v.feedback && <div className="mt-1 text-sm rounded bg-black/5 p-2">Feedback: {v.feedback}</div>}
            </li>
          ))}
          {j.versions.length === 0 && <li className="py-2 text-muted">No versions yet.</li>}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-medium">Scripts, footage and references</h2>
        <p className="text-xs text-muted mt-1">Links to files in your own cloud or local storage. Nothing is uploaded here.</p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {links.map((l) => (
            <li key={l.id} className="py-2 flex items-center gap-3"><span className="text-xs uppercase text-muted w-24 shrink-0">{l.kind.toLowerCase()}</span><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-accent truncate">{l.title}</a>
              <form action={removeRefLinkAction} className="ml-auto">{hid}<input type="hidden" name="linkId" value={l.id} /><button className="text-xs text-muted underline">Remove</button></form></li>
          ))}
          {links.length === 0 && <li className="py-2 text-muted">No links yet.</li>}
        </ul>
        <form action={addRefLinkAction} className="mt-3 grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-end">{hid}
          <div><label className={labelCls}>Title</label><input name="title" maxLength={200} className={field} /></div>
          <div><label className={labelCls}>Link</label><input name="url" required placeholder="https://" className={field} /></div>
          <div><label className={labelCls}>Kind</label><select name="kind" defaultValue="REFERENCE" className={field}>{LINK_KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}</select></div>
          <button className={btn}>Add</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-medium">Comments</h2>
        <ul className="mt-2 space-y-2 text-sm">{comments.map((m) => <li key={m.id}><span className="font-medium">{nm(m.authorId)}</span> <span className="text-xs text-muted">{fmtT(m.createdAt)}</span><div className="whitespace-pre-wrap">{m.body}</div></li>)}{comments.length === 0 && <li className="text-muted">No comments yet.</li>}</ul>
        <form action={commentAction} className="mt-3 flex gap-2 items-end">{hid}<textarea name="body" rows={2} required maxLength={4000} className={field} /><button className={btn}>Post</button></form>
      </section>
    </div>
  );
}
