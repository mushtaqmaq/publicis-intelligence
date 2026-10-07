import { prisma } from "@/lib/prisma";
import { createMediaPlanAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function NewMediaPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, select: { name: true } });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="New Media Plan"
        subtitle="Set the campaign brief first. Assets are added to the plan afterwards, once the campaign dates determine which rate year applies."
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <form action={createMediaPlanAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Plan type</label>
          <select name="planType" defaultValue="OFFLINE" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="OFFLINE">Offline / OOH (inventory lines)</option>
            <option value="ONLINE">Online (digital objectives and platforms)</option>
            <option value="HYBRID">Hybrid (online and offline in one plan)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Client *
            </label>
            <input
              type="text"
              name="clientName"
              list="client-list"
              required
              placeholder="Select or type a new client"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
            <datalist id="client-list">
              {clients.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Brand
            </label>
            <input
              type="text"
              name="brand"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Campaign Name *
            </label>
            <input
              type="text"
              name="campaignName"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Campaign ID
            </label>
            <input
              type="text"
              name="campaignId"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Campaign Start *
            </label>
            <input
              type="date"
              name="campaignStart"
              defaultValue={today}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Campaign End *
            </label>
            <input
              type="date"
              name="campaignEnd"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Budget
            </label>
            <input
              type="number"
              name="budget"
              step="0.01"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Currency
            </label>
            <select
              name="currency"
              defaultValue="QAR"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="QAR">QAR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Objective
          </label>
          <input
            type="text"
            name="objective"
            placeholder="e.g. Brand awareness, product launch…"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Target Audience
            </label>
            <input
              type="text"
              name="targetAudience"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Target Locations
            </label>
            <input
              type="text"
              name="targetLocations"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
          Create Plan &amp; Add Assets →
        </button>
      </form>
    </div>
  );
}
