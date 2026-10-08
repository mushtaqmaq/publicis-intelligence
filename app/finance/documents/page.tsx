import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinanceUser } from "@/lib/auth/finance";
import { STATUSES, type DocType } from "@/lib/finance/rules";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner } from "@/components/platform/Banner";
import { TYPE_LABEL, TYPE_ONE, label, fmtDay, money, th, btn } from "@/components/finance/ui";
import { toMinor } from "@/lib/finance/money";

export default async function Documents({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; ok?: string; error?: string }> }) {
  await requireFinanceUser();
  const sp = await searchParams;
  const type = (Object.keys(TYPE_LABEL).includes(sp.type ?? "") ? sp.type : "INVOICE") as DocType;
  const status = STATUSES[type].includes(sp.status ?? "") ? sp.status : undefined;
  const rows = await prisma.financeDocument.findMany({ where: { type, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 300, include: { client: { select: { name: true } }, supplier: { select: { name: true } }, campaign: { select: { code: true } } } });
  const today = new Date();
  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title={TYPE_LABEL[type]} actions={<Link href={`/finance/documents/new?type=${type}`} className={btn}>New {TYPE_ONE[type]}</Link>} />
      <Banner error={sp.error} ok={sp.ok} />
      <div className="mt-5 flex flex-wrap gap-1">{Object.keys(TYPE_LABEL).map((t) => <Link key={t} href={`/finance/documents?type=${t}`} className={`px-3 py-1.5 rounded-md text-sm ${t === type ? "bg-foreground text-white" : "text-muted hover:bg-black/5"}`}>{TYPE_LABEL[t]}</Link>)}</div>
      <div className="mt-3 flex flex-wrap gap-1 text-xs"><Link href={`/finance/documents?type=${type}`} className={`px-2 py-1 rounded ${!status ? "bg-black/10" : "text-muted"}`}>all</Link>{STATUSES[type].map((s) => <Link key={s} href={`/finance/documents?type=${type}&status=${s}`} className={`px-2 py-1 rounded ${s === status ? "bg-black/10" : "text-muted"}`}>{label(s)}</Link>)}</div>
      <table className="w-full text-sm border-collapse mt-4">
        <thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border"><th className={th}>Number</th><th className={th}>{type === "PURCHASE_ORDER" || type === "BILL" ? "Supplier" : "Client"}</th><th className={th}>Campaign</th><th className={th}>Date</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Outstanding</th><th className={th}>Status</th></tr></thead>
        <tbody>{rows.map((r) => {
          const out = toMinor(Number(r.total)) - toMinor(Number(r.paidAmount));
          const late = (r.type === "INVOICE" || r.type === "BILL") && r.dueDate && out > 0 && r.dueDate.getTime() < today.getTime() && ["ISSUED", "PART_PAID", "APPROVED"].includes(r.status);
          return <tr key={r.id} className="border-b border-border">
            <td className="py-2 pr-4 tabular-nums"><Link href={`/finance/documents/${r.id}`} className="text-accent">{r.code ?? "Draft"}</Link></td>
            <td className="py-2 pr-4">{r.client?.name ?? r.supplier?.name ?? "—"}</td><td className="py-2 pr-4 text-muted">{r.campaign?.code ?? "—"}</td>
            <td className="py-2 pr-4 tabular-nums">{fmtDay(r.issueDate ?? r.createdAt)}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{money(toMinor(Number(r.total)))}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{r.type === "INVOICE" || r.type === "BILL" ? money(["ISSUED", "PART_PAID", "APPROVED"].includes(r.status) ? out : 0) : ""}</td>
            <td className={`py-2 pr-4 ${late ? "text-[var(--danger)] font-medium" : "text-muted"}`}>{label(r.status)}{late ? " · overdue" : ""}</td></tr>;
        })}</tbody>
      </table>
      {rows.length === 0 && <p className="text-sm text-muted mt-6">Nothing here.</p>}
    </div>
  );
}
