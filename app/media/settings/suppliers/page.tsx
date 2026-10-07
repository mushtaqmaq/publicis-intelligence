import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createSupplierAction, toggleSupplierActiveAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const MEDIA_CHANNELS = ["OOH", "RADIO", "TV", "PRINT", "CINEMA", "SMS", "DIGITAL"] as const;

export default async function SuppliersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireMediaUser();
  const { error, notice } = await searchParams;

  const suppliers = await prisma.supplier.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { assets: true, rateCards: true } } },
  });

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Suppliers (admin)"
        subtitle="Every supplier that sells inventory into this planner — create new ones here, correct their media channel, legacy-name aliases (used for import matching), contact details, and default discount."
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Supplier</th>
            <th className="py-2 pr-4 font-medium">Channel</th>
            <th className="py-2 pr-4 font-medium text-right">Assets</th>
            <th className="py-2 pr-4 font-medium text-right">Rate cards</th>
            <th className="py-2 pr-4 font-medium">Contact</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-b border-border">
              <td className="py-2 pr-4 font-medium text-foreground">{s.name}</td>
              <td className="py-2 pr-4">
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200">
                  {s.mediaChannel}
                </span>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{s._count.assets}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{s._count.rateCards}</td>
              <td className="py-2 pr-4 text-muted">{s.contactEmail ?? "—"}</td>
              <td className="py-2 pr-4">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border ${
                    s.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                >
                  {s.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="py-2 pr-4 text-right">
                <div className="flex items-center gap-3 justify-end">
                  <Link href={`/media/settings/suppliers/${s.id}/edit`} className="text-xs text-accent underline">
                    Edit
                  </Link>
                  <form action={toggleSupplierActiveAction}>
                    <input type="hidden" name="supplierId" value={s.id} />
                    <button type="submit" className="text-xs text-accent underline">
                      {s.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-medium text-foreground mb-3">Create supplier</h2>
        <form action={createSupplierAction} className="space-y-3 bg-surface border border-border rounded-lg p-5">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Name</label>
            <input type="text" name="name" required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Media Channel</label>
            <select name="mediaChannel" defaultValue="OOH" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              {MEDIA_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Legacy names (comma-separated)
            </label>
            <input
              type="text"
              name="legacyNames"
              placeholder="e.g. Old Name Inc, ABC Media"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Contact email</label>
            <input type="email" name="contactEmail" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Default discount %</label>
            <input
              type="number"
              step="0.01"
              name="defaultDiscountPct"
              placeholder="e.g. 15 for 15%"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
            Create Supplier
          </button>
        </form>
      </div>
    </div>
  );
}
