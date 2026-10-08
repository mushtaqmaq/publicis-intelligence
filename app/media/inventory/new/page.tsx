import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createAssetAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PRICING_BASIS = [
  "PER_DAY", "PER_FACE", "PER_SCREEN", "PER_SCREEN_BUNDLE", "PER_POLE", "PER_CIRCUIT", "PER_NETWORK",
  "PER_SPOT", "PER_INSERTION", "PER_MESSAGE", "PER_1000_IMPRESSIONS", "PER_CLICK", "PER_WEEK",
  "PER_2_WEEKS", "PER_4_WEEKS", "PER_3_MONTHS", "PER_6_MONTHS", "PER_12_MONTHS", "FIXED_PACKAGE", "CUSTOM",
];
const CALC_METHODS = [
  "FIXED", "PRO_RATA", "DAILY", "PER_FACE_DAILY", "PER_FACE", "PER_CIRCUIT", "PER_SPOT", "PER_INSERTION",
  "PER_MESSAGE", "PER_SCREEN", "PER_NETWORK", "PER_POLE", "CPM", "CPC", "MONTHLY", "CUSTOM",
];

export default async function NewAssetPage({ searchParams }: { searchParams: Promise<{ error?: string; supplierId?: string }> }) {
  await requireMediaUser("inventory");
  const { error, supplierId } = await searchParams;
  const [suppliers, categories] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: [{ mediaChannel: "asc" }, { name: "asc" }] }),
    prisma.assetCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const otherCategory = categories.find((c) => c.name === "Other");
  const currentYear = new Date().getFullYear();

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/media/inventory" className="text-sm text-accent underline">
        ← Back to Inventory
      </Link>
      <div className="mt-3">
        <PageHeader
          title="New Asset"
          subtitle={
            <>
              Add a single asset by hand — for a new digital placement (e.g. a DV360 or InMobi line item), a
              one-off site, or anything else that doesn&apos;t come from a rate-card upload. Need a brand new
              supplier first? <Link href="/media/settings/suppliers" className="text-accent underline">Create it here</Link>.
            </>
          }
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      <form action={createAssetAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Supplier</label>
          <select
            name="supplierId"
            required
            defaultValue={supplierId ?? ""}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.mediaChannel})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Asset Name</label>
          <input
            type="text"
            name="assetName"
            required
            placeholder="e.g. App Install — CPI, or In-Feed Video — CPM"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Media Type (free text)</label>
            <input type="text" name="mediaType" placeholder="e.g. Digital Ad" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Category</label>
            <select name="mediaCategoryId" defaultValue={otherCategory?.id} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Location (free text)</label>
            <input
              type="text"
              name="locationName"
              required
              placeholder="e.g. DV360 — Qatar/GCC"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Format</label>
            <select name="format" defaultValue="" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="">Not applicable (non-OOH)</option>
              <option value="STATIC">Static</option>
              <option value="DIGITAL">Digital</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Notes</label>
          <textarea name="notes" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>

        <div className="pt-3 border-t border-border">
          <h2 className="text-sm font-medium text-foreground mb-3">Rate (optional — add now or later from the asset page)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Calculation Method</label>
              <select name="pricingCalculationMethod" defaultValue="CPM" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                {CALC_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Pricing Basis</label>
              <select name="pricingBasis" defaultValue="PER_1000_IMPRESSIONS" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                {PRICING_BASIS.map((b) => (
                  <option key={b} value={b}>
                    {b.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Status</label>
              <select name="grossRateStatus" defaultValue="KNOWN" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                <option value="KNOWN">Known</option>
                <option value="TBD">TBD</option>
                <option value="ON_REQUEST">On Request</option>
                <option value="POA">POA</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Gross Rate</label>
              <input type="number" step="0.01" name="grossRate" placeholder="e.g. 36.40" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Currency</label>
              <select name="currency" defaultValue="QAR" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                <option value="QAR">QAR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Quantity Basis</label>
              <input type="text" name="quantityBasis" placeholder="e.g. per 1,000 impressions" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Duration (value / unit)</label>
              <div className="flex gap-2">
                <input type="number" name="durationValue" placeholder="2" className="w-1/2 rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
                <input type="text" name="durationUnit" placeholder="weeks" className="w-1/2 rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Rate Year</label>
              <input type="number" name="rateYear" defaultValue={currentYear} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Source note</label>
            <input
              type="text"
              name="sourceNote"
              placeholder="e.g. DV360 rate sheet from account manager, email 2026-10-01"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <SubmitButton pendingText="Creating…" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
          Create Asset
        </SubmitButton>
      </form>
    </div>
  );
}
