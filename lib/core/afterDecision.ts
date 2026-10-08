import { prisma } from "@/lib/prisma";
import { audit } from "./service";
import { onVersionReviewed } from "@/lib/creative/service";
import { onMultimediaReviewed } from "@/lib/multimedia/service";
import { onFinanceApproval } from "@/lib/finance/service";

// What happens to a document when its approval closes. One place, so every module reacts the same way.
export async function afterDecision(requestId: string, actorId: string) {
  const r = await prisma.approvalRequest.findUnique({ where: { id: requestId }, include: { steps: { orderBy: { stepOrder: "asc" } } } });
  if (!r || r.status === "PENDING" || r.status === "CANCELLED") return;
  const result = r.status === "APPROVED" ? "APPROVED" : "REJECTED";
  const feedback = r.steps.find((s) => s.status === "REJECTED")?.comment ?? null;
  if (r.documentType === "CAMPAIGN" && result === "APPROVED") {
    await prisma.campaign.updateMany({ where: { id: r.documentId, status: "DRAFT" }, data: { status: "ACTIVE" } });
    await audit(actorId, "CAMPAIGN_ACTIVATED", "Campaign", r.documentId, { via: "approval" });
  }
  if (r.documentType === "CREATIVE_VERSION") await onVersionReviewed(r.documentId, result, actorId, feedback);
  if (["QUOTATION", "PURCHASE_ORDER", "BILL"].includes(r.documentType)) await onFinanceApproval(r.documentId, result, actorId);
  if (r.documentType === "MULTIMEDIA_VERSION") await onMultimediaReviewed(r.documentId, result, actorId, feedback);
}
