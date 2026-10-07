import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requireMediaUser();
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true, rateCards: true } } },
  });

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Suppliers" subtitle={`${suppliers.length} active suppliers`} />

      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Supplier</th>
            <th className="py-2 pr-4 font-medium text-right">Assets</th>
            <th className="py-2 pr-4 font-medium text-right">Rate cards</th>
            <th className="py-2 pr-4 font-medium">Contact</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-b border-border hover:bg-surface">
              <td className="py-2 pr-4 font-medium text-foreground">
                <Link href={`/media/suppliers/${s.id}`} className="hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{s._count.assets}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{s._count.rateCards}</td>
              <td className="py-2 pr-4 text-muted">{s.contactEmail ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
