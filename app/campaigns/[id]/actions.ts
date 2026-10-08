"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformUser } from "@/lib/auth/platform";
import { prisma } from "@/lib/prisma";
import { addComment, addLink, audit, CoreError, removeLink, submitApproval } from "@/lib/core/service";
import { withMessage } from "@/lib/core/formErrors";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (id: string) => `/campaigns/${id}`;

export async function addLinkAction(formData: FormData) {
  const user = await requirePlatformUser();
  const id = str(formData, "campaignId");
  const entityType = str(formData, "entityType") || "Campaign";
  const entityId = str(formData, "entityId") || id;
  await withMessage(back(id), async () => { await addLink(user.id, { entityType, entityId, title: str(formData, "title"), url: str(formData, "url"), kind: str(formData, "kind") }); }, "Link added");
}

export async function removeLinkAction(formData: FormData) {
  const user = await requirePlatformUser();
  const id = str(formData, "campaignId");
  await withMessage(back(id), async () => { await removeLink(user.id, str(formData, "linkId")); }, "Link removed");
}

export async function addCommentAction(formData: FormData) {
  const user = await requirePlatformUser();
  const id = str(formData, "campaignId");
  await withMessage(back(id), async () => { await addComment(user.id, { entityType: "Campaign", entityId: id, body: str(formData, "body") }); });
}

export async function addDeliverableAction(formData: FormData) {
  const user = await requirePlatformUser();
  const id = str(formData, "campaignId");
  await withMessage(back(id), async () => {
    const title = str(formData, "title");
    if (!title) throw new CoreError("Enter a deliverable title.");
    const due = str(formData, "dueDate");
    const d = await prisma.deliverable.create({ data: { campaignId: id, title, description: str(formData, "description") || null, dueDate: due ? new Date(due + "T00:00:00Z") : null } });
    await audit(user.id, "DELIVERABLE_ADDED", "Deliverable", d.id, { campaignId: id, title });
  });
}

const STATUSES = ["PENDING", "IN_PROGRESS", "DELIVERED", "APPROVED"] as const;
export async function setDeliverableStatusAction(formData: FormData) {
  const user = await requirePlatformUser();
  const id = str(formData, "campaignId");
  await withMessage(back(id), async () => {
    const status = str(formData, "status") as (typeof STATUSES)[number];
    if (!STATUSES.includes(status)) throw new CoreError("Unknown status.");
    const d = await prisma.deliverable.findFirst({ where: { id: str(formData, "deliverableId"), campaignId: id } });
    if (!d) throw new CoreError("That deliverable no longer exists.");
    await prisma.deliverable.update({ where: { id: d.id }, data: { status } });
    await audit(user.id, "DELIVERABLE_STATUS", "Deliverable", d.id, { status }, { status: d.status });
  });
}

export async function requestApprovalAction(formData: FormData) {
  const user = await requirePlatformUser();
  const id = str(formData, "campaignId");
  await withMessage(back(id), async () => {
    const c = await prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new CoreError("That campaign no longer exists.");
    if (c.status !== "DRAFT") throw new CoreError("Only a draft campaign needs approval.");
    await submitApproval({ id: user.id, role: user.role }, { documentType: "CAMPAIGN", documentId: id, title: `${c.code} ${c.name}`, amount: c.budget == null ? null : Number(c.budget) });
    revalidatePath("/approvals");
  }, "Approval requested");
}
