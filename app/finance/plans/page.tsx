import { prisma } from "@/lib/prisma";
import { requireFinanceUser } from "@/lib/auth/finance";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner } from "@/components/platform/Banner";
import { card, btn, label, th } from "@/components/finance/ui";
import { fromPlanAction } from "../actions";

export default async function PlansForFinance({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireFinanceUser();
  const sp = await searchParams;
  const plans = await prisma.mediaPlan.findMany({ where: { status: { in: ["CLIENT_SHARED", "APPROVED", "BOOKED", "COMPLETED"] } }, orderBy: { updatedAt: "desc" }, take: 100, include: { client: { select: { name: true } }, financeDocuments: { where: { status: { notIn: ["CANCELLED", "REJECTED"] } }, select: { type: true } } } });
  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="From media plans" subtitle="Prepare finance documents straight from a shared or approved plan. The client quotation uses Net to Client; purchase orders use Net to Media, one per supplier. A placement with a pending (TBD/POA) cost stops the process." />
      <Banner error={sp.error} ok={sp.ok} />
      <table className={`w-full text-sm border-collapse mt-6 ${card}`}>
        <thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border"><th className={th}>Plan</th><th className={th}>Client</th><th className={th}>Status</th><th className={th}>Documents</th><th className={th} /></tr></thead>
        <tbody>{plans.map((p) => {
          const q = p.financeDocuments.filter((d) => d.type === "QUOTATION").length, po = p.financeDocuments.filter((d) => d.type === "PURCHASE_ORDER").length;
          return <tr key={p.id} className="border-b border-border"><td className="py-2 pr-4 font-medium">{p.planCode} <span className="font-normal text-muted">{p.campaignName}</span></td><td className="py-2 pr-4">{p.client.name}</td><td className="py-2 pr-4 text-muted">{label(p.status)}</td><td className="py-2 pr-4 text-muted">{q} quotation · {po} PO</td>
            <td className="py-2 flex gap-2"><form action={fromPlanAction}><input type="hidden" name="planId" value={p.id} /><input type="hidden" name="what" value="quotation" /><button className={btn}>Quotation</button></form><form action={fromPlanAction}><input type="hidden" name="planId" value={p.id} /><input type="hidden" name="what" value="pos" /><button className={btn}>Purchase orders</button></form></td></tr>;
        })}</tbody>
      </table>
      {plans.length === 0 && <p className="text-sm text-muted mt-6">No shared or approved plans yet.</p>}
    </div>
  );
}
