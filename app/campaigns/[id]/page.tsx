import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePlatformUser } from "@/lib/auth/platform";
import { LINK_KINDS } from "@/lib/core/links";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { addCommentAction, addDeliverableAction, addLinkAction, removeLinkAction, requestApprovalAction, setDeliverableStatusAction } from "./actions";

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requirePlatformUser();
  const [{ id }, { error, ok }] = await Promise.all([params, searchParams]);
  const c = await prisma.campaign.findUnique({ where: { id }, include: { client: true, owner: { select: { name: true, email: true } }, deliverables: { orderBy: { createdAt: "asc" } }, mediaPlans: { select: { id: true, planCode: true, campaignName: true, status: true } }, creativeRequests: { select: { id: true, code: true, title: true, status: true }, orderBy: { createdAt: "asc" } }, multimediaJobs: { select: { id: true, code: true, title: true, status: true }, orderBy: { createdAt: "asc" } } } });
  if (!c) notFound();
  const [links, comments, approvals] = await Promise.all([
    prisma.link.findMany({ where: { OR: [{ entityType: "Campaign", entityId: id }, { entityType: "Deliverable", entityId: { in: c.deliverables.map((d) => d.id) } }] }, orderBy: { createdAt: "asc" } }),
    prisma.comment.findMany({ where: { entityType: "Campaign", entityId: id }, orderBy: { createdAt: "asc" } }),
    prisma.approvalRequest.findMany({ where: { documentType: "CAMPAIGN", documentId: id }, orderBy: { createdAt: "desc" }, include: { steps: { orderBy: { stepOrder: "asc" } } } }),
  ]);
  const authors = await prisma.user.findMany({ where: { id: { in: comments.map((x) => x.authorId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const who = (uid: string | null) => { const u = authors.find((a) => a.id === uid); return u ? (u.name ?? u.email) : "Someone"; };
  const open = approvals.find((a) => a.status === "PENDING");
  const card = "mt-6 bg-surface border border-border rounded-lg p-5";

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader eyebrow={c.code} title={c.name} subtitle={`${c.client.name} · ${c.status.replace("_", " ").toLowerCase()} · ${fmt(c.startDate)} to ${fmt(c.endDate)}${c.budget != null ? ` · QAR ${Number(c.budget).toLocaleString()}` : ""}`} />
      <Banner error={error} ok={ok} />
      {c.notes && <p className="mt-4 text-sm whitespace-pre-wrap">{c.notes}</p>}

      <section className={card}>
        <h2 className="font-medium">Approval</h2>
        {approvals.map((a) => (
          <div key={a.id} className="mt-2 text-sm">
            <span className="font-medium">{a.status.toLowerCase()}</span>
            <ol className="mt-1 text-muted">{a.steps.map((s) => <li key={s.id}>{s.stepOrder}. {s.label}: {s.status.toLowerCase()}{s.comment ? ` (${s.comment})` : ""}</li>)}</ol>
          </div>
        ))}
        {c.status === "DRAFT" && !open && (
          <form action={requestApprovalAction} className="mt-3"><input type="hidden" name="campaignId" value={c.id} /><button className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">Request approval</button></form>
        )}
        {approvals.length === 0 && c.status !== "DRAFT" && <p className="text-sm text-muted mt-2">No approval was needed.</p>}
      </section>

      <section className={card}>
        <h2 className="font-medium">Links</h2>
        <p className="text-xs text-muted mt-1">Briefs, references, artwork and footage stay in your own cloud or local storage. Add the link here; nothing is uploaded to this platform.</p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {links.map((l) => (
            <li key={l.id} className="py-2 flex items-center gap-3">
              <span className="text-xs uppercase text-muted w-24 shrink-0">{l.kind.toLowerCase()}</span>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-accent truncate">{l.title}</a>
              <form action={removeLinkAction} className="ml-auto"><input type="hidden" name="campaignId" value={c.id} /><input type="hidden" name="linkId" value={l.id} /><button className="text-xs text-muted underline">Remove</button></form>
            </li>
          ))}
          {links.length === 0 && <li className="py-2 text-muted">No links yet.</li>}
        </ul>
        <form action={addLinkAction} className="mt-3 grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-end">
          <input type="hidden" name="campaignId" value={c.id} />
          <div><label className={labelCls}>Title</label><input name="title" maxLength={200} className={field} /></div>
          <div><label className={labelCls}>Link</label><input name="url" required placeholder="https://" className={field} /></div>
          <div><label className={labelCls}>Kind</label><select name="kind" className={field}>{LINK_KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}</select></div>
          <button className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">Add</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-medium">Deliverables</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {c.deliverables.map((d) => (
            <li key={d.id} className="py-2 flex items-center gap-3">
              <span className="font-medium">{d.title}</span><span className="text-muted">due {fmt(d.dueDate)}</span>
              <form action={setDeliverableStatusAction} className="ml-auto flex gap-1">
                <input type="hidden" name="campaignId" value={c.id} /><input type="hidden" name="deliverableId" value={d.id} />
                <select name="status" defaultValue={d.status} className="text-xs rounded border border-border bg-background px-1.5 py-0.5">{["PENDING", "IN_PROGRESS", "DELIVERED", "APPROVED"].map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</select>
                <button className="text-xs text-accent underline">Save</button>
              </form>
            </li>
          ))}
          {c.deliverables.length === 0 && <li className="py-2 text-muted">No deliverables yet.</li>}
        </ul>
        <form action={addDeliverableAction} className="mt-3 grid grid-cols-[2fr_1fr_auto] gap-2 items-end">
          <input type="hidden" name="campaignId" value={c.id} />
          <div><label className={labelCls}>Deliverable</label><input name="title" required maxLength={200} className={field} /></div>
          <div><label className={labelCls}>Due</label><input type="date" name="dueDate" className={field} /></div>
          <button className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">Add</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-medium">Media plans</h2>
        <ul className="mt-2 text-sm">{c.mediaPlans.map((p) => <li key={p.id}><Link href={`/media/plans/${p.id}`} className="text-accent">{p.planCode} {p.campaignName}</Link> <span className="text-muted">{p.status.toLowerCase()}</span></li>)}{c.mediaPlans.length === 0 && <li className="text-muted">None linked yet.</li>}</ul>
      </section>

      <section className={card}>
        <div className="flex items-center"><h2 className="font-medium">Creative requests</h2><Link href={`/creative/new?campaign=${c.id}`} className="ml-auto text-sm text-accent">New request</Link></div>
        <ul className="mt-2 text-sm">{c.creativeRequests.map((q) => <li key={q.id}><Link href={`/creative/${q.id}`} className="text-accent">{q.code} {q.title}</Link> <span className="text-muted">{q.status.replace(/_/g, " ").toLowerCase()}</span></li>)}{c.creativeRequests.length === 0 && <li className="text-muted">None yet.</li>}</ul>
      </section>

      <section className={card}>
        <div className="flex items-center"><h2 className="font-medium">Multimedia jobs</h2><Link href={`/multimedia/new?campaign=${c.id}`} className="ml-auto text-sm text-accent">New job</Link></div>
        <ul className="mt-2 text-sm">{c.multimediaJobs.map((q) => <li key={q.id}><Link href={`/multimedia/${q.id}`} className="text-accent">{q.code} {q.title}</Link> <span className="text-muted">{q.status.replace(/_/g, " ").toLowerCase()}</span></li>)}{c.multimediaJobs.length === 0 && <li className="text-muted">None yet.</li>}</ul>
      </section>

      <section className={card}>
        <h2 className="font-medium">Comments</h2>
        <ul className="mt-2 space-y-2 text-sm">{comments.map((m) => <li key={m.id}><span className="font-medium">{who(m.authorId)}</span> <span className="text-xs text-muted">{m.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span><div className="whitespace-pre-wrap">{m.body}</div></li>)}{comments.length === 0 && <li className="text-muted">No comments yet.</li>}</ul>
        <form action={addCommentAction} className="mt-3 flex gap-2 items-end"><input type="hidden" name="campaignId" value={c.id} /><textarea name="body" rows={2} required maxLength={4000} className={field} /><button className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">Post</button></form>
      </section>
    </div>
  );
}
