import { prisma } from "@/lib/prisma";
import { requirePlatformUser } from "@/lib/auth/platform";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { createCampaignAction } from "../actions";

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requirePlatformUser();
  const [{ error }, clients, people] = await Promise.all([
    searchParams,
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { email: "asc" }, select: { id: true, name: true, email: true } }),
  ]);
  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="New campaign" />
      <Banner error={error} />
      <form action={createCampaignAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <div><label className={labelCls}>Campaign name</label><input name="name" required maxLength={200} className={field} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Client</label>
            <select name="clientId" required className={field}><option value="">Choose a client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className={labelCls}>Owner</label>
            <select name="ownerId" defaultValue={user.id} className={field}>{people.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={labelCls}>Start</label><input type="date" name="startDate" className={field} /></div>
          <div><label className={labelCls}>End</label><input type="date" name="endDate" className={field} /></div>
          <div><label className={labelCls}>Budget (QAR)</label><input type="number" name="budget" min="0" step="0.01" className={field} /></div>
        </div>
        <div><label className={labelCls}>Notes</label><textarea name="notes" rows={3} className={field} /></div>
        <button type="submit" className="rounded-md bg-foreground px-4 py-1.5 text-sm text-white">Create campaign</button>
      </form>
    </div>
  );
}
