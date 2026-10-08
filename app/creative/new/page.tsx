import { prisma } from "@/lib/prisma";
import { requireCreativeUser, creativeStaff } from "@/lib/auth/creative";
import { KINDS, PRIORITIES } from "@/lib/creative/workflow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { createRequestAction } from "../actions";

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ error?: string; campaign?: string }> }) {
  const { actor } = await requireCreativeUser();
  const { error, campaign } = await searchParams;
  const [clients, campaigns, staff] = await Promise.all([
    prisma.client.findMany({ where: { departments: { has: "creative" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.campaign.findMany({ where: { status: { in: ["DRAFT", "ACTIVE"] } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, code: true, name: true, clientId: true, deliverables: { select: { id: true, title: true } } } }),
    actor.manager ? creativeStaff() : Promise.resolve([]),
  ]);
  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="New creative request" subtitle="Only clients handled by Creative are listed." />
      <Banner error={error} />
      <form action={createRequestAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <div><label className={labelCls}>Title</label><input name="title" required maxLength={200} className={field} /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={labelCls}>Client</label><select name="clientId" required className={field}><option value="">Choose</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className={labelCls}>Type</label><select name="kind" className={field}>{KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ").toLowerCase()}</option>)}</select></div>
          <div><label className={labelCls}>Priority</label><select name="priority" defaultValue="NORMAL" className={field}>{PRIORITIES.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}</select></div>
        </div>
        <div><label className={labelCls}>Brief</label><textarea name="brief" required rows={6} placeholder="What is needed, for whom, where it will run, sizes, tone, must-haves." className={field} /></div>
        <div className="grid grid-cols-[1fr_2fr] gap-4">
          <div><label className={labelCls}>Brief / reference title</label><input name="linkTitle" maxLength={200} className={field} /></div>
          <div><label className={labelCls}>Link to brief or references (optional)</label><input name="linkUrl" placeholder="https://" className={field} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Campaign (optional, must be the same client)</label>
            <select name="campaignId" defaultValue={campaign ?? ""} className={field}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></div>
          <div><label className={labelCls}>Deliverable (optional)</label>
            <select name="deliverableId" className={field}><option value="">None</option>{campaigns.flatMap((c) => c.deliverables.map((d) => <option key={d.id} value={d.id}>{c.code}: {d.title}</option>))}</select></div>
        </div>
        <div><label className={labelCls}>Deadline</label><input type="date" name="dueDate" className={field} /></div>
        {actor.manager && (
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Designer</label><select name="assigneeId" className={field}><option value="">Assign later</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</select></div>
            <div><label className={labelCls}>Reviewer</label><select name="reviewerId" className={field}><option value="">Use approval steps</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</select></div>
          </div>
        )}
        <button type="submit" className="rounded-md bg-foreground px-4 py-1.5 text-sm text-white">Create request</button>
      </form>
    </div>
  );
}
