import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSupplierAction } from "../../actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const MEDIA_CHANNELS = ["OOH", "RADIO", "TV", "PRINT", "CINEMA", "SMS", "DIGITAL"] as const;

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  await requireMediaUser();
  const { supplierId } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) notFound();

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/media/settings/suppliers" className="text-sm text-accent underline">
        ← Back to Suppliers
      </Link>
      <div className="mt-3">
        <PageHeader title="Edit Supplier" />
      </div>

      <form action={updateSupplierAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <input type="hidden" name="supplierId" value={supplier.id} />

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Name</label>
          <input
            type="text"
            name="name"
            defaultValue={supplier.name}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Media Channel</label>
            <select
              name="mediaChannel"
              defaultValue={supplier.mediaChannel}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              {MEDIA_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Default discount %</label>
            <input
              type="number"
              step="0.01"
              name="defaultDiscountPct"
              defaultValue={supplier.defaultDiscountPct ? Number(supplier.defaultDiscountPct) * 100 : ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Legacy names (comma-separated)
          </label>
          <input
            type="text"
            name="legacyNames"
            defaultValue={supplier.legacyNames.join(", ")}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Contact name</label>
            <input
              type="text"
              name="contactName"
              defaultValue={supplier.contactName ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Contact email</label>
            <input
              type="email"
              name="contactEmail"
              defaultValue={supplier.contactEmail ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Contact phone</label>
            <input
              type="text"
              name="contactPhone"
              defaultValue={supplier.contactPhone ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Website</label>
            <input
              type="text"
              name="website"
              defaultValue={supplier.website ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Notes</label>
          <textarea
            name="notes"
            defaultValue={supplier.notes ?? ""}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
          Save Changes
        </button>
      </form>
    </div>
  );
}
