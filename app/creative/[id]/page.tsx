import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCreativeUser, creativeStaff } from "@/lib/auth/creative";
import * as wf from "@/lib/creative/workflow";
import { LINK_KINDS } from "@/lib/core/links";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { addRefLinkAction, assignAction, cancelRequestAction, commentAction, deliverAction, removeRefLinkAction, startAction, submitVersionAction } from "./actions";

const label = (s: string) => s.replace(/_/g, " ").toLowerCase();
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const btn = "rounded-md bg-foreground px-3 py-1.5 text-sm text-white";

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { user, actor } = await requireCreativeUser();
  const [{ id }, { error, ok }] = await Promise.all([params, searchParams]);
  const r = await prisma.creativeRequest.findUnique({ where: { id }, include: { client: true, campaign: { select: { id: true, code: true, name: true } }, deliverable: { select: { title: true } }, versions: { orderBy: { versionNo: "desc" } }, multimediaJobs: { select: { id: true, code: true, title: true } } } });
  if (!r) notFound();
  const [links, comments, staff] = await Promise.all([
    prisma.link.findMany({ where: { entityType: "CreativeRequest", entityId: id }, orderBy: { createdAt: "asc" } }),
    prisma.comment.findMany({ where: { entityType: "CreativeRequest", entityId: id }, orderBy: { createdAt: "asc" } }),
    wf.canAssign(r, { id: user.id, manager: actor.manager }) ? creativeStaff() : Promise.resolve([]),
  ]);
  const ids = [r.assigneeId, r.reviewerId, r.requestedById, ...comments.map((c) => c.authorId)].filter((x): x is string => !!x);
  const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  const nm = (uid: string | null) => { const p = people.find((x) => x.id === uid); return p ? (p.name ?? p.email) : "—"; };
  const w = { id: user.id, manager: actor.manager };
  const reqShape = { status: r.status, requestedById: r.requestedById, assigneeId: r.assigneeId, reviewerId: r.reviewerId };
  const card = "mt-6 bg-surface border border-border rounded-lg p-5";
  const hid = <input type="hidden" name="id" value={r.id} />;

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader eyebrow={`${r.code} · ${label(r.kind)}`} title={r.title} subtitle={`${r.client.name} · ${label(r.status)} · priority ${r.priority.toLowerCase()} · due ${fmt(r.dueDate)}`} />
      <Banner error={error} ok={ok} />
      <div className="mt-4 text-sm text-muted">
        Asked by {nm(r.requestedById)} · Designer: {nm(r.assigneeId)} · Reviewer: {r.reviewerId ? nm(r.reviewerId) : "set by approval steps"}
        {r.campaign && <> · Campaign: <Link href={`/campaigns/${r.campaign.id}`} className="text-accent">{r.campaign.code} {r.campaign.name}</Link></>}
        {r.deliverable && <> · Deliverable: {r.deliverable.title}</>}
      </div>
      <p className="mt-4 text-sm whitespace-pre-wrap">{r.brief}</p>

      <section className={card}>
        <h2 className="font-medium">Next step</h2>
        <div className="mt-3 flex flex-wrap gap-3 items-start">
          {wf.canStart(reqShape, w) && <form action={startAction}>{hid}<button className={btn}>Start work</button></form>}
          {wf.canDeliver(reqShape, w) && (
            <form action={deliverAction} className="flex gap-2 items-end">{hid}<input name="note" placeholder="Delivery note (optional)" className={field} /><button className={btn}>Mark delivered</button></form>
          )}
          {wf.canCancel(reqShape, w) && <form action={cancelRequestAction}>{hid}<button className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel request</button></form>}
          {r.status === "IN_REVIEW" && <p className="text-sm text-muted">Waiting for review. The reviewer decides on the Approvals page.</p>}
          {r.status === "NEW" && <p className="text-sm text-muted">Waiting for a creative manager to assign a designer.</p>}
          {r.status === "DELIVERED" && <p className="text-sm text-muted">Delivered {fmt(r.deliveredAt)}{r.deliveryNote ? `: ${r.deliveryNote}` : ""}</p>}
        </div>
        {wf.canSubmit(reqShape, w) && (
          <form action={submitVersionAction} className="mt-4 grid grid-cols-[2fr_2fr_auto] gap-2 items-end">{hid}
            <div><label className={labelCls}>Link to artwork (your own storage)</label><input name="url" required placeholder="https://" className={field} /></div>
            <div><label className={labelCls}>What changed</label><input name="notes" maxLength={500} className={field} /></div>
            <button className={btn}>Send for review</button>
          </form>
        )}
      </section>

      {wf.canAssign(reqShape, w) && (
        <section className={card}>
          <h2 className="font-medium">Assignment</h2>
          <form action={assignAction} className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">{hid}
            <div><label className={labelCls}>Designer</label><select name="assigneeId" defaultValue={r.assigneeId ?? ""} className={field}><option value="">Choose</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</select></div>
            <div><label className={labelCls}>Reviewer</label><select name="reviewerId" defaultValue={r.reviewerId ?? ""} className={field}><option value="">Use approval steps</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</select></div>
            <button className={btn}>Save</button>
          </form>
        </section>
      )}

      <section className={card}>
        <h2 className="font-medium">Versions and revision history</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {r.versions.map((v) => (
            <li key={v.id} className="py-2">
              <div className="flex gap-3 items-center"><span className="font-medium">v{v.versionNo}</span><a href={v.url} target="_blank" rel="noopener noreferrer" className="text-accent truncate">{v.url}</a><span className="ml-auto text-muted">{label(v.status)}</span></div>
              <div className="text-xs text-muted">{nm(v.submittedById)} · {fmt(v.createdAt)}{v.notes ? ` · ${v.notes}` : ""}</div>
              {v.feedback && <div className="mt-1 text-sm rounded bg-black/5 p-2">Feedback: {v.feedback}</div>}
            </li>
          ))}
          {r.versions.length === 0 && <li className="py-2 text-muted">No versions yet.</li>}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-medium">Briefs and references</h2>
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
        <div className="flex items-center"><h2 className="font-medium">Multimedia jobs for this request</h2><Link href={`/multimedia/new?creative=${r.id}${r.campaignId ? `&campaign=${r.campaignId}` : ""}`} className="ml-auto text-sm text-accent">New job</Link></div>
        <ul className="mt-2 text-sm">{r.multimediaJobs.map((q) => <li key={q.id}><Link href={`/multimedia/${q.id}`} className="text-accent">{q.code} {q.title}</Link></li>)}{r.multimediaJobs.length === 0 && <li className="text-muted">None yet.</li>}</ul>
      </section>

      <section className={card}>
        <h2 className="font-medium">Comments</h2>
        <ul className="mt-2 space-y-2 text-sm">{comments.map((m) => <li key={m.id}><span className="font-medium">{nm(m.authorId)}</span> <span className="text-xs text-muted">{m.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span><div className="whitespace-pre-wrap">{m.body}</div></li>)}{comments.length === 0 && <li className="text-muted">No comments yet.</li>}</ul>
        <form action={commentAction} className="mt-3 flex gap-2 items-end">{hid}<textarea name="body" rows={2} required maxLength={4000} className={field} /><button className={btn}>Post</button></form>
      </section>
    </div>
  );
}
