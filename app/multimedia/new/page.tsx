import { prisma } from "@/lib/prisma";
import { requireMultimediaUser, multimediaStaff } from "@/lib/auth/multimedia";
import { JOB_TYPES } from "@/lib/multimedia/workflow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { createJobAction } from "../actions";

export default async function NewJob({ searchParams }: { searchParams: Promise<{ error?: string; campaign?: string; creative?: string }> }) {
  const { actor } = await requireMultimediaUser();
  const { error, campaign, creative } = await searchParams;
  const [clients, campaigns, creatives, staff] = await Promise.all([
    prisma.client.findMany({ where: { departments: { has: "multimedia" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.campaign.findMany({ where: { status: { in: ["DRAFT", "ACTIVE"] } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, code: true, name: true, deliverables: { select: { id: true, title: true } } } }),
    prisma.creativeRequest.findMany({ where: { status: { notIn: ["CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, code: true, title: true } }),
    actor.manager ? multimediaStaff() : Promise.resolve([]),
  ]);
  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="New multimedia job" subtitle="Only clients handled by Multimedia are listed." />
      <Banner error={error} />
      <form action={createJobAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <div><label className={labelCls}>Title</label><input name="title" required maxLength={200} className={field} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Client</label><select name="clientId" required className={field}><option value="">Choose</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className={labelCls}>Type</label><select name="jobType" className={field}>{JOB_TYPES.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ").toLowerCase()}</option>)}</select></div>
        </div>
        <div><label className={labelCls}>Brief</label><textarea name="brief" required rows={5} placeholder="What is needed: concept, talent, locations, equipment, runtime, formats, references." className={field} /></div>
        <div className="grid grid-cols-[1fr_2fr] gap-4">
          <div><label className={labelCls}>Brief / script title</label><input name="linkTitle" maxLength={200} className={field} /></div>
          <div><label className={labelCls}>Link to brief or script (optional)</label><input name="linkUrl" placeholder="https://" className={field} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Campaign (optional, same client)</label><select name="campaignId" defaultValue={campaign ?? ""} className={field}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></div>
          <div><label className={labelCls}>Deliverable (optional)</label><select name="deliverableId" className={field}><option value="">None</option>{campaigns.flatMap((c) => c.deliverables.map((d) => <option key={d.id} value={d.id}>{c.code}: {d.title}</option>))}</select></div>
        </div>
        <div><label className={labelCls}>Realises a Creative request (optional, same client)</label><select name="creativeRequestId" defaultValue={creative ?? ""} className={field}><option value="">None</option>{creatives.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Location</label><input name="location" maxLength={200} className={field} /></div>
          <div><label className={labelCls}>Delivery deadline</label><input type="date" name="dueDate" className={field} /></div>
        </div>
        {actor.manager && (
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Producer</label><select name="producerId" className={field}><option value="">Assign later</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</select></div>
            <div><label className={labelCls}>Reviewer</label><select name="reviewerId" className={field}><option value="">Use approval steps</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</select></div>
          </div>
        )}
        <button type="submit" className="rounded-md bg-foreground px-4 py-1.5 text-sm text-white">Create job</button>
      </form>
    </div>
  );
}
