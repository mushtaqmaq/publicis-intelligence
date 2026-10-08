import { prisma } from "@/lib/prisma";
import { nextNumber } from "./sequence";
import { isLinkKind, isLinkable, validateLinkUrl } from "./links";
import { ApprovalError, buildSteps, cancel, decide, type Actor, type Role, type Step, type StepDef } from "./approvals";

type Db = typeof prisma;
export class CoreError extends Error {}

export async function audit(userId: string | null, action: string, entityType: string, entityId: string | null, newValue?: object, oldValue?: object, db: Db = prisma) {
  await db.auditLog.create({ data: { userId, action, entityType, entityId, newValue: newValue as never, oldValue: oldValue as never } });
}

// ---- Campaigns ------------------------------------------------------------------------------------------

export type CampaignInput = { name: string; clientId: string; startDate?: Date | null; endDate?: Date | null; budget?: number | null; ownerId?: string | null; notes?: string | null };

export async function createCampaign(userId: string, input: CampaignInput) {
  const name = input.name.trim();
  if (!name) throw new CoreError("Enter a campaign name.");
  if (input.startDate && input.endDate && input.endDate < input.startDate) throw new CoreError("The end date is before the start date.");
  if (input.budget != null && (!isFinite(input.budget) || input.budget < 0)) throw new CoreError("The budget must be zero or more.");
  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
  if (!client) throw new CoreError("Choose a client.");
  const created = await prisma.$transaction(async (tx) => {
    const code = await nextNumber(tx as never, "CMP", "CMP");
    return tx.campaign.create({ data: { code, name, clientId: input.clientId, startDate: input.startDate ?? null, endDate: input.endDate ?? null, budget: input.budget ?? null, ownerId: input.ownerId || null, notes: input.notes?.trim() || null, createdById: userId } });
  });
  await audit(userId, "CAMPAIGN_CREATED", "Campaign", created.id, { code: created.code, name });
  return created;
}

// ---- Links and comments -----------------------------------------------------------------------------------

async function assertEntity(entityType: string, entityId: string) {
  if (!isLinkable(entityType)) throw new CoreError("Links cannot be added to that kind of record.");
  const found = entityType === "Campaign" ? await prisma.campaign.findUnique({ where: { id: entityId }, select: { id: true } })
    : entityType === "CreativeRequest" ? await prisma.creativeRequest.findUnique({ where: { id: entityId }, select: { id: true } })
    : entityType === "MultimediaJob" ? await prisma.multimediaJob.findUnique({ where: { id: entityId }, select: { id: true } })
    : await prisma.deliverable.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!found) throw new CoreError("That record no longer exists.");
}

export async function addLink(userId: string, p: { entityType: string; entityId: string; title: string; url: string; kind: string }) {
  await assertEntity(p.entityType, p.entityId);
  const v = validateLinkUrl(p.url);
  if (!v.ok) throw new CoreError(v.error);
  const title = p.title.trim() || new URL(v.url).hostname;
  if (title.length > 200) throw new CoreError("The title is too long.");
  const kind = isLinkKind(p.kind) ? p.kind : "OTHER";
  const link = await prisma.link.create({ data: { entityType: p.entityType, entityId: p.entityId, title, url: v.url, kind, addedById: userId } });
  await audit(userId, "LINK_ADDED", p.entityType, p.entityId, { title, url: v.url, kind });
  return link;
}

export async function removeLink(userId: string, linkId: string) {
  const l = await prisma.link.findUnique({ where: { id: linkId } });
  if (!l) return;
  await prisma.link.delete({ where: { id: linkId } });
  await audit(userId, "LINK_REMOVED", l.entityType, l.entityId, undefined, { title: l.title, url: l.url });
}

export async function addComment(userId: string, p: { entityType: string; entityId: string; body: string }) {
  await assertEntity(p.entityType, p.entityId);
  const body = p.body.trim();
  if (!body) throw new CoreError("Write a comment first.");
  if (body.length > 4000) throw new CoreError("The comment is too long.");
  return prisma.comment.create({ data: { entityType: p.entityType, entityId: p.entityId, body, authorId: userId } });
}

// ---- Approvals --------------------------------------------------------------------------------------------

const toDefs = (steps: { label: string; approverUserId: string | null; approverRole: Role | null; minAmount: unknown }[]): StepDef[] =>
  steps.map((s) => ({ label: s.label, approverUserId: s.approverUserId, approverRole: s.approverRole, minAmount: s.minAmount == null ? null : Number(s.minAmount) }));

// Saves the ordered approvers for a document type (admin action). Replaces the previous steps.
export async function saveApprovalTemplate(userId: string, documentType: string, name: string, steps: StepDef[]) {
  if (!/^[A-Z_]{2,40}$/.test(documentType)) throw new CoreError("Document type must be capital letters and underscores.");
  if (steps.length === 0) throw new CoreError("Add at least one approval step.");
  for (const [i, s] of steps.entries()) {
    if (!s.label.trim()) throw new CoreError(`Step ${i + 1} needs a label.`);
    if (!s.approverUserId && !s.approverRole) throw new CoreError(`Step ${i + 1} needs an approver (a person or a role).`);
  }
  await prisma.$transaction(async (tx) => {
    const t = await tx.approvalTemplate.upsert({ where: { documentType }, create: { documentType, name }, update: { name } });
    await tx.approvalTemplateStep.deleteMany({ where: { templateId: t.id } });
    await tx.approvalTemplateStep.createMany({ data: steps.map((s, i) => ({ templateId: t.id, stepOrder: i + 1, label: s.label.trim(), approverUserId: s.approverUserId || null, approverRole: s.approverUserId ? null : (s.approverRole ?? null), minAmount: s.minAmount ?? null })) });
  });
  await audit(userId, "APPROVAL_TEMPLATE_SAVED", "ApprovalTemplate", documentType, { steps });
}

// Starts an approval. Steps come from the document type's template unless `steps` overrides them for this request.
export async function submitApproval(requester: Actor, p: { documentType: string; documentId: string; title: string; amount?: number | null; note?: string; steps?: StepDef[] }) {
  const open = await prisma.approvalRequest.findFirst({ where: { documentType: p.documentType, documentId: p.documentId, status: "PENDING" }, select: { id: true } });
  if (open) throw new CoreError("This document already has an approval in progress.");
  let defs = p.steps;
  if (!defs) {
    const t = await prisma.approvalTemplate.findUnique({ where: { documentType: p.documentType }, include: { steps: { orderBy: { stepOrder: "asc" } } } });
    if (!t) throw new ApprovalError("No approval steps are set up for this document type. Ask an admin to configure them.");
    defs = toDefs(t.steps);
  }
  const steps = buildSteps(defs, p.amount ?? null, requester.id);
  const req = await prisma.approvalRequest.create({
    data: { documentType: p.documentType, documentId: p.documentId, title: p.title, amount: p.amount ?? null, note: p.note?.trim() || null, requestedById: requester.id, steps: { create: steps.map((s) => ({ stepOrder: s.stepOrder, label: s.label, approverUserId: s.approverUserId, approverRole: s.approverRole, status: s.status })) } },
    include: { steps: true },
  });
  await audit(requester.id, "APPROVAL_REQUESTED", p.documentType, p.documentId, { requestId: req.id, steps: steps.map((s) => s.label) });
  return req;
}

async function load(requestId: string) {
  const req = await prisma.approvalRequest.findUnique({ where: { id: requestId }, include: { steps: { orderBy: { stepOrder: "asc" } } } });
  if (!req) throw new CoreError("That approval request was not found.");
  const steps: Step[] = req.steps.map((s) => ({ stepOrder: s.stepOrder, label: s.label, approverUserId: s.approverUserId, approverRole: s.approverRole as Role | null, status: s.status }));
  return { req, steps };
}

// Writes a decision. The acted-on step is claimed with a conditional update, so two people acting at once cannot both win.
async function persist(requestId: string, actor: Actor, d: ReturnType<typeof decide>, before: Step[], comment: string | undefined, action: string) {
  await prisma.$transaction(async (tx) => {
    if (d.actedStepOrder > 0) {
      const claimed = await tx.approvalStep.updateMany({ where: { requestId, stepOrder: d.actedStepOrder, status: "PENDING" }, data: { status: d.steps.find((s) => s.stepOrder === d.actedStepOrder)!.status, actedById: actor.id, actedAt: new Date(), comment: comment?.trim() || null } });
      if (claimed.count !== 1) throw new CoreError("Someone else just acted on this step. Reload and check.");
    }
    for (const s of d.steps) {
      const prev = before.find((b) => b.stepOrder === s.stepOrder)!;
      if (s.stepOrder !== d.actedStepOrder && s.status !== prev.status) await tx.approvalStep.updateMany({ where: { requestId, stepOrder: s.stepOrder, status: prev.status }, data: { status: s.status } });
    }
    await tx.approvalRequest.update({ where: { id: requestId }, data: { status: d.status, decidedAt: d.status === "PENDING" ? null : new Date() } });
  });
  const r = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, select: { documentType: true, documentId: true } });
  await audit(actor.id, action, r.documentType, r.documentId, { requestId, status: d.status, comment });
}

export async function actOnApproval(actor: Actor, requestId: string, action: "APPROVE" | "REJECT", comment?: string) {
  const { req, steps } = await load(requestId);
  const d = decide(steps, req.status, action, actor, req.requestedById, comment);
  await persist(requestId, actor, d, steps, comment, action === "APPROVE" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED");
  return d.status;
}

export async function cancelApproval(actor: Actor, requestId: string) {
  const { req, steps } = await load(requestId);
  const d = cancel(steps, req.status, actor, req.requestedById);
  await persist(requestId, actor, d, steps, undefined, "APPROVAL_CANCELLED");
}

// Requests waiting on this person right now (their step is the current one, by name or by role).
export async function myPendingApprovals(actor: Actor) {
  return prisma.approvalRequest.findMany({
    where: { status: "PENDING", requestedById: { not: actor.id }, steps: { some: { status: "PENDING", OR: [{ approverUserId: actor.id }, { approverUserId: null, approverRole: actor.role }] } } },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
}
