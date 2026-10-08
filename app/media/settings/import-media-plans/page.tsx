import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ImportMediaPlansClient } from "./ImportMediaPlansClient";
import { parseMediaPlanFilesAction, commitMediaPlanImportAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportMediaPlansPage() {
  await requireMediaUser("settings");
  const [clients, suppliers, existingPlanCodes] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.mediaPlan.findMany({ select: { planCode: true } }),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Import Ended Media Plans"
        subtitle="Upload real, already-completed campaign media plans (.xlsx) to bulk-log them as Completed. Each file is parsed for its client, campaign name, dates, and total spend — review and correct anything before it's saved, nothing is committed automatically."
      />

      <ImportMediaPlansClient
        clients={clients}
        suppliers={suppliers}
        existingPlanCodes={existingPlanCodes.map((p) => p.planCode)}
        parseFiles={parseMediaPlanFilesAction}
        commitImport={commitMediaPlanImportAction}
      />
    </div>
  );
}
