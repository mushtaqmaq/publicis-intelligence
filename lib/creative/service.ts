import { prisma } from "@/lib/prisma";
import { audit, CoreError, submitApproval, cancelApproval, addLink } from "@/lib/core/service";
import { nextNumber } from "@/lib/core/sequence";
import { validateLinkUrl } from "@/lib/core/links";
import type { Actor, StepDef } from "@/lib/core/approvals";
import * as wf from "./workflow";

export type CActor = Actor & { manager: boolean };
const who = (a: CActor): wf.Who => ({ id: a.id, manager: a.manager });
const wrap = <T>(fn: () => Promise<T>) => fn().catch((e) => { throw e instanceof wf.WorkflowError ? new CoreError(e.message) : e; });

async function load(id: string) {
  const r = await prisma.creativeRequest.findUnique({ where: { id } });
  if (!r) throw new CoreError("That request no longer exists.");
  return r;
}
const asReq = (r: Awaited<ReturnType<typeof load>>): wf.Req => ({ status: r.status, requestedById: r.requestedById, assigneeId: r.assigneeId, reviewerId: r.reviewerId });

export type NewRequest = { title: string; kind: string; brief: string; priority: string; clientId: string; campaignId?: string | null; deliverableId?: string | null; dueDate?: Date | null; assigneeId?: string | null; reviewerId?: string | null; briefLinks?: { title: string; url: string }[] };

export async function createRequest(actor: CActor, input: NewRequest) {
  const title = input.title.trim(), brief = input.brief.trim();
  if (!title) throw new CoreError("Enter a title.");
  if (brief.length < 10) throw new CoreError("Write a brief of at least a sentence so the designer knows what is needed.");
  const kind = (wf.KINDS as readonly string[]).includes(input.kind) ? input.kind : "DESIGN";
  const priority = (wf.PRIORITIES as readonly string[]).includes(input.priority) ? input.priority : "NORMAL";
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new CoreError("Choose a client.");
  if (!client.departments.includes("creative")) throw new CoreError(`${client.name} is not handled by Creative. Ask an admin to switch Creative on for this client.`);
  let campaignId = input.campaignId || null, deliverableId = input.deliverableId || null;
  if (campaignId) {
    const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } });
    if (!c) throw new CoreError("That campaign no longer exists.");
    if (c.clientId !== client.id) throw new CoreError("The campaign belongs to a different client.");
  }
  if (deliverableId) {
    const d = await prisma.deliverable.findUnique({ where: { id: deliverableId }, select: { campaignId: true } });
    if (!d || d.campaignId !== campaignId) throw new CoreError("That deliverable is not part of the chosen campaign.");
  }
  let assigneeId = input.assigneeId || null; const reviewerId = input.reviewerId || null;
  if (assigneeId || reviewerId) { await wrap(async () => wf.checkAssignment(assigneeId, reviewerId)); if (!actor.manager) { /* requester may assign on their own request */ } }
  const links = (input.briefLinks ?? []).filter((l) => l.url.trim());
  for (const l of links) { const v = validateLinkUrl(l.url); if (!v.ok) throw new CoreError(v.error); }
  const req = await prisma.$transaction(async (tx) => {
    const code = await nextNumber(tx as never, "CRQ", "CRQ");
    return tx.creativeRequest.create({ data: { code, title, kind, brief, priority, clientId: client.id, campaignId, deliverableId, requestedById: actor.id, assigneeId, reviewerId, dueDate: input.dueDate ?? null, status: assigneeId ? "ASSIGNED" : "NEW", assignedAt: assigneeId ? new Date() : null } });
  });
  for (const l of links) await addLink(actor.id, { entityType: "CreativeRequest", entityId: req.id, title: l.title, url: l.url, kind: "BRIEF" });
  await audit(actor.id, "CREATIVE_REQUEST_CREATED", "CreativeRequest", req.id, { code: req.code, title });
  return req;
}

export async function assign(actor: CActor, id: string, assigneeId: string | null, reviewerId: string | null) {
  const r = await load(id);
  if (!wf.canAssign(asReq(r), who(actor))) throw new CoreError("You cannot assign this request.");
  await wrap(async () => wf.checkAssignment(assigneeId, reviewerId));
  const updated = await prisma.creativeRequest.update({ where: { id }, data: { assigneeId, reviewerId, status: wf.statusAfterAssign(r.status), assignedAt: new Date() } });
  await audit(actor.id, "CREATIVE_ASSIGNED", "CreativeRequest", id, { assigneeId, reviewerId }, { assigneeId: r.assigneeId, reviewerId: r.reviewerId });
  return updated;
}

export async function start(actor: CActor, id: string) {
  const r = await load(id);
  if (!wf.canStart(asReq(r), who(actor))) throw new CoreError("Only the assigned designer can start this request.");
  await prisma.creativeRequest.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  await audit(actor.id, "CREATIVE_STARTED", "CreativeRequest", id);
}

// The designer hands in a version (a link to the artwork). It goes to the approval steps for Creative,
// or to the named reviewer when none are configured.
export async function submitVersion(actor: CActor, id: string, p: { url: string; notes?: string }) {
  const r = await load(id);
  if (!wf.canSubmit(asReq(r), who(actor))) throw new CoreError("Only the assigned designer can hand in a version, and only while the request is being worked on.");
  const v = validateLinkUrl(p.url);
  if (!v.ok) throw new CoreError(v.error);
  const template = await prisma.approvalTemplate.findUnique({ where: { documentType: "CREATIVE_VERSION" }, select: { id: true } });
  await wrap(async () => wf.needsReviewer(!!template, r.reviewerId));
  const prev = r.status;
  const versions = await prisma.creativeVersion.findMany({ where: { requestId: id }, select: { versionNo: true } });
  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.creativeVersion.create({ data: { requestId: id, versionNo: wf.nextVersionNo(versions.map((x) => x.versionNo)), url: v.url, notes: p.notes?.trim() || null, submittedById: actor.id } });
    const moved = await tx.creativeRequest.updateMany({ where: { id, status: prev }, data: { status: "IN_REVIEW" } });
    if (moved.count !== 1) throw new CoreError("This request just changed. Reload and try again.");
    return created;
  });
  try {
    const steps: StepDef[] | undefined = template ? undefined : [{ label: "Review", approverUserId: r.reviewerId }];
    await submitApproval(actor, { documentType: "CREATIVE_VERSION", documentId: version.id, title: `${r.code} ${r.title} v${version.versionNo}`, steps });
  } catch (e) {
    await prisma.creativeVersion.delete({ where: { id: version.id } });
    await prisma.creativeRequest.update({ where: { id }, data: { status: prev } });
    throw e;
  }
  await audit(actor.id, "CREATIVE_VERSION_SUBMITTED", "CreativeRequest", id, { versionNo: version.versionNo, url: v.url });
  return version;
}

// Called when the approval on a version closes (see lib/core/afterDecision.ts).
export async function onVersionReviewed(versionId: string, result: "APPROVED" | "REJECTED", reviewerId: string, feedback: string | null) {
  const version = await prisma.creativeVersion.findUnique({ where: { id: versionId } });
  if (!version) return;
  const out = wf.afterReview(result);
  await prisma.$transaction([
    prisma.creativeVersion.update({ where: { id: versionId }, data: { status: out.version, feedback, decidedAt: new Date() } }),
    prisma.creativeRequest.updateMany({ where: { id: version.requestId, status: "IN_REVIEW" }, data: { status: out.request } }),
  ]);
  await audit(reviewerId, result === "APPROVED" ? "CREATIVE_VERSION_APPROVED" : "CREATIVE_CHANGES_REQUESTED", "CreativeRequest", version.requestId, { versionNo: version.versionNo, feedback });
}

export async function deliver(actor: CActor, id: string, note: string) {
  const r = await load(id);
  if (!wf.canDeliver(asReq(r), who(actor))) throw new CoreError("This request cannot be delivered yet. The latest version must be approved first.");
  const approved = await prisma.creativeVersion.findFirst({ where: { requestId: id, status: "APPROVED" }, orderBy: { versionNo: "desc" } });
  if (!approved) throw new CoreError("There is no approved version to deliver.");
  await prisma.creativeRequest.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: new Date(), deliveryNote: note.trim() || null } });
  await audit(actor.id, "CREATIVE_DELIVERED", "CreativeRequest", id, { versionNo: approved.versionNo, url: approved.url });
}

export async function cancelRequest(actor: CActor, id: string) {
  const r = await load(id);
  if (!wf.canCancel(asReq(r), who(actor))) throw new CoreError("You cannot cancel this request.");
  // Withdraw a review that is still open so the reviewer is not left with a dead item.
  if (r.status === "IN_REVIEW") {
    const versions = await prisma.creativeVersion.findMany({ where: { requestId: id, status: "SUBMITTED" }, select: { id: true } });
    const open = await prisma.approvalRequest.findMany({ where: { documentType: "CREATIVE_VERSION", documentId: { in: versions.map((v) => v.id) }, status: "PENDING" }, select: { id: true } });
    for (const a of open) await cancelApproval({ id: actor.id, role: actor.role }, a.id).catch(() => {});
  }
  await prisma.creativeRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(actor.id, "CREATIVE_CANCELLED", "CreativeRequest", id);
}
