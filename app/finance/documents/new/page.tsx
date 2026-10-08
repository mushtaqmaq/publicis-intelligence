import { prisma } from "@/lib/prisma";
import { requireFinanceUser } from "@/lib/auth/finance";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner } from "@/components/platform/Banner";
import { DocForm } from "@/components/finance/DocForm";
import { TYPE_LABEL, TYPE_ONE } from "@/components/finance/ui";
import { createDocumentAction } from "../../actions";

export default async function NewDocument({ searchParams }: { searchParams: Promise<{ type?: string; error?: string }> }) {
  await requireFinanceUser();
  const sp = await searchParams;
  const type = Object.keys(TYPE_LABEL).includes(sp.type ?? "") ? sp.type! : "INVOICE";
  const [clients, suppliers, campaigns] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 300, select: { id: true, code: true, name: true } }),
  ]);
  return (
    <div className="p-8 max-w-4xl">
      <PageHeader title={`New ${TYPE_ONE[type]}`} subtitle="Finance sees every client. Better still: create it from a media plan or from the document it follows." />
      <Banner error={sp.error} />
      <DocForm type={type} action={createDocumentAction} clients={clients} suppliers={suppliers} campaigns={campaigns.map((c) => ({ id: c.id, name: `${c.code} ${c.name}` }))} submitLabel="Create draft" />
    </div>
  );
}
