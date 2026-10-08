import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePlatformUser } from "@/lib/auth/platform";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function CampaignsPage() {
  await requirePlatformUser();
  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { client: { select: { name: true } }, _count: { select: { mediaPlans: true, deliverables: true } } } });
  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Campaigns" subtitle="One record per campaign. Media plans, creative, multimedia and finance all attach to it." actions={<Link href="/campaigns/new" className="rounded-md bg-foreground px-3 py-1.5 text-sm text-white">New campaign</Link>} />
      <table className="w-full text-sm border-collapse mt-6">
        <thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
          <th className="py-2 pr-4 font-medium">Code</th><th className="py-2 pr-4 font-medium">Campaign</th><th className="py-2 pr-4 font-medium">Client</th><th className="py-2 pr-4 font-medium">Status</th><th className="py-2 pr-4 font-medium text-right">Plans</th><th className="py-2 pr-4 font-medium text-right">Deliverables</th>
        </tr></thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-border">
              <td className="py-2 pr-4 tabular-nums text-muted">{c.code}</td>
              <td className="py-2 pr-4 font-medium"><Link href={`/campaigns/${c.id}`} className="text-accent">{c.name}</Link></td>
              <td className="py-2 pr-4">{c.client.name}</td>
              <td className="py-2 pr-4 text-muted">{c.status.replace("_", " ").toLowerCase()}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{c._count.mediaPlans}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{c._count.deliverables}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {campaigns.length === 0 && <p className="text-sm text-muted mt-6">No campaigns yet.</p>}
    </div>
  );
}
