import { prisma } from "@/lib/prisma";
import { audit, CoreError, submitApproval, cancelApproval, addLink } from "@/lib/core/service";
import { nextNumber } from "@/lib/core/sequence";
import { validateLinkUrl } from "@/lib/core/links";
import type { Actor, StepDef } from "@/lib/core/approvals";
import * as wf from "./workflow";

export type MActor = Actor & { manager: boolean };
const who = (a: MActor): wf.Who => ({ id: a.id, manager: a.manager });
const wrap = <T>(fn: () => Promise<T>) => fn().catch((e) => { throw e instanceof wf.WorkflowError ? new CoreError(e.message) : e; });

async function load(id: string) {
  const j = await prisma.multimediaJob.findUnique({ where: { id } });
  if (!j) throw new CoreError("That job no longer exists.");
  return j;
}
const asJob = (j: Awaited<ReturnType<typeof load>>): wf.Job => ({ status: j.status, requestedById: j.requestedById, producerId: j.producerId, reviewerId: j.reviewerId });

export type NewJob = { title: string; jobType: string; brief: string; clientId: string; campaignId?: string | null; deliverableId?: string | null; creativeRequestId?: string | null; location?: string | null; dueDate?: Date | null; producerId?: string | null; reviewerId?: string | null; briefLink?: { title: string; url: string } };

export async function createJob(actor: MActor, input: NewJob) {
  const title = input.title.trim(), brief = input.brief.trim();
  if (!title) throw new CoreError("Enter a title.");
  if (brief.length < 10) throw new CoreError("Write a brief of at least a sentence.");
  const jobType = (wf.JOB_TYPES as readonly string[]).includes(input.jobType) ? input.jobType : "OTHER";
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new CoreError("Choose a client.");
  if (!client.departments.includes("multimedia")) throw new CoreError(`${client.name} is not handled by Multimedia. Ask an admin to switch Multimedia on for this client.`);
  const campaignId = input.campaignId || null, deliverableId = input.deliverableId || null, creativeRequestId = input.creativeRequestId || null;
  if (campaignId) {
    const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } });
    if (!c) throw new CoreError("That campaign no longer exists.");
    if (c.clientId !== client.id) throw new CoreError("The campaign belongs to a different client.");
  }
  if (deliverableId) {
    const d = await prisma.deliverable.findUnique({ where: { id: deliverableId }, select: { campaignId: true } });
    if (!d || d.campaignId !== campaignId) throw new CoreError("That deliverable is not part of the chosen campaign.");
  }
  if (creativeRequestId) {
    const cr = await prisma.creativeRequest.findUnique({ where: { id: creativeRequestId }, select: { clientId: true } });
    if (!cr) throw new CoreError("That creative request no longer exists.");
    if (cr.clientId !== client.id) throw new CoreError("The creative request belongs to a different client.");
  }
  const producerId = input.producerId || null, reviewerId = input.reviewerId || null;
  await wrap(async () => wf.checkProducer(producerId, reviewerId));
  if (input.briefLink?.url.trim()) { const v = validateLinkUrl(input.briefLink.url); if (!v.ok) throw new CoreError(v.error); }
  const job = await prisma.$transaction(async (tx) => {
    const code = await nextNumber(tx as never, "MMJ", "MMJ");
    return tx.multimediaJob.create({ data: { code, title, jobType, brief, clientId: client.id, campaignId, deliverableId, creativeRequestId, requestedById: actor.id, producerId, reviewerId, location: input.location?.trim() || null, dueDate: input.dueDate ?? null } });
  });
  if (input.briefLink?.url.trim()) await addLink(actor.id, { entityType: "MultimediaJob", entityId: job.id, title: input.briefLink.title, url: input.briefLink.url, kind: "BRIEF" });
  await audit(actor.id, "MULTIMEDIA_JOB_CREATED", "MultimediaJob", job.id, { code: job.code, title });
  return job;
}

export async function setProducer(actor: MActor, id: string, producerId: string | null, reviewerId: string | null) {
  const j = await load(id);
  if (!wf.canPlan(asJob(j), who(actor))) throw new CoreError("You cannot change this job.");
  if (!producerId) throw new CoreError("Choose a producer.");
  await wrap(async () => wf.checkProducer(producerId, reviewerId));
  await prisma.multimediaJob.update({ where: { id }, data: { producerId, reviewerId } });
  await audit(actor.id, "MULTIMEDIA_PRODUCER_SET", "MultimediaJob", id, { producerId, reviewerId }, { producerId: j.producerId, reviewerId: j.reviewerId });
}

// Sets the shoot/work window and location; the job becomes SCHEDULED.
export async function schedule(actor: MActor, id: string, p: { startsAt: Date; endsAt: Date; location?: string | null }) {
  const j = await load(id);
  if (!wf.canSchedule(asJob(j), who(actor))) throw new CoreError("You cannot schedule this job.");
  if (!j.producerId) throw new CoreError("Choose a producer before scheduling.");
  await wrap(async () => wf.checkSlot(p));
  await prisma.multimediaJob.update({ where: { id }, data: { startsAt: p.startsAt, endsAt: p.endsAt, location: p.location?.trim() || j.location, status: "SCHEDULED" } });
  await audit(actor.id, "MULTIMEDIA_SCHEDULED", "MultimediaJob", id, { startsAt: p.startsAt, endsAt: p.endsAt });
}

// ---- Tasks ----------------------------------------------------------------------------------------------------
export async function addTask(actor: MActor, jobId: string, p: { title: string; assigneeId?: string | null; dueDate?: Date | null }) {
  const j = await load(jobId);
  if (!wf.canPlan(asJob(j), who(actor))) throw new CoreError("You cannot add tasks to this job.");
  const title = p.title.trim();
  if (!title) throw new CoreError("Enter a task.");
  const t = await prisma.multimediaTask.create({ data: { jobId, title, assigneeId: p.assigneeId || null, dueDate: p.dueDate ?? null } });
  await audit(actor.id, "MULTIMEDIA_TASK_ADDED", "MultimediaJob", jobId, { title });
  return t;
}
export async function setTaskStatus(actor: MActor, taskId: string, status: string) {
  if (!(wf.TASK_STATUSES as readonly string[]).includes(status)) throw new CoreError("Unknown status.");
  const t = await prisma.multimediaTask.findUnique({ where: { id: taskId }, include: { job: true } });
  if (!t) throw new CoreError("That task no longer exists.");
  if (t.job.status === "DELIVERED" || t.job.status === "CANCELLED") throw new CoreError("This job is closed.");
  if (t.assigneeId !== actor.id && !wf.canPlan(asJob(t.job), who(actor))) throw new CoreError("Only the assignee, the producer or a manager can update this task.");
  await prisma.multimediaTask.update({ where: { id: taskId }, data: { status } });
  await audit(actor.id, "MULTIMEDIA_TASK_STATUS", "MultimediaJob", t.jobId, { task: t.title, status }, { status: t.status });
}

// ---- Resources and bookings -----------------------------------------------------------------------------
export async function createResource(actor: MActor, p: { name: string; kind: string; notes?: string }) {
  if (!actor.manager) throw new CoreError("Only a multimedia manager can add resources.");
  const name = p.name.trim();
  if (!name) throw new CoreError("Enter a name.");
  if (!(wf.RESOURCE_KINDS as readonly string[]).includes(p.kind)) throw new CoreError("Choose a kind.");
  if (await prisma.resource.findUnique({ where: { name } })) throw new CoreError("A resource with that name already exists.");
  const r = await prisma.resource.create({ data: { name, kind: p.kind, notes: p.notes?.trim() || null } });
  await audit(actor.id, "RESOURCE_CREATED", "Resource", r.id, { name, kind: p.kind });
  return r;
}
export async function setResourceActive(actor: MActor, id: string, isActive: boolean) {
  if (!actor.manager) throw new CoreError("Only a multimedia manager can change resources.");
  await prisma.resource.update({ where: { id }, data: { isActive } });
  await audit(actor.id, isActive ? "RESOURCE_ENABLED" : "RESOURCE_DISABLED", "Resource", id);
}

// Books a resource for a job. A resource cannot be in two places at once: the check and the insert run together
// under a per-resource lock, so two people booking at the same moment cannot both win.
export async function bookResource(actor: MActor, jobId: string, p: { resourceId: string; startsAt: Date; endsAt: Date; note?: string }) {
  const j = await load(jobId);
  if (!wf.canPlan(asJob(j), who(actor))) throw new CoreError("You cannot book resources for this job.");
  await wrap(async () => wf.checkSlot(p));
  const res = await prisma.resource.findUnique({ where: { id: p.resourceId } });
  if (!res || !res.isActive) throw new CoreError("That resource is not available.");
  const booking = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"resource:" + p.resourceId}))`;
    const existing = await tx.resourceBooking.findMany({ where: { resourceId: p.resourceId, startsAt: { lt: p.endsAt }, endsAt: { gt: p.startsAt } }, include: { job: { select: { code: true, title: true } } } });
    const clash = wf.findConflicts(p, existing);
    if (clash.length) {
      const c = clash[0];
      throw new CoreError(`${res.name} is already booked for ${c.job.code} ${c.job.title} (${c.startsAt.toISOString().slice(0, 16).replace("T", " ")} to ${c.endsAt.toISOString().slice(0, 16).replace("T", " ")} UTC).`);
    }
    return tx.resourceBooking.create({ data: { resourceId: p.resourceId, jobId, startsAt: p.startsAt, endsAt: p.endsAt, note: p.note?.trim() || null, createdById: actor.id } });
  });
  await audit(actor.id, "RESOURCE_BOOKED", "MultimediaJob", jobId, { resource: res.name, startsAt: p.startsAt, endsAt: p.endsAt });
  return booking;
}
export async function removeBooking(actor: MActor, bookingId: string) {
  const b = await prisma.resourceBooking.findUnique({ where: { id: bookingId }, include: { job: true, resource: true } });
  if (!b) return;
  if (!wf.canPlan(asJob(b.job), who(actor))) throw new CoreError("You cannot change this job's bookings.");
  await prisma.resourceBooking.delete({ where: { id: bookingId } });
  await audit(actor.id, "RESOURCE_UNBOOKED", "MultimediaJob", b.jobId, { resource: b.resource.name });
}

// ---- Delivery flow ----------------------------------------------------------------------------------------
export async function start(actor: MActor, id: string) {
  const j = await load(id);
  if (!wf.canStart(asJob(j), who(actor))) throw new CoreError("Only the producer can start a scheduled job.");
  await prisma.multimediaJob.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  await audit(actor.id, "MULTIMEDIA_STARTED", "MultimediaJob", id);
}

export async function submitVersion(actor: MActor, id: string, p: { url: string; notes?: string }) {
  const j = await load(id);
  if (!wf.canSubmit(asJob(j), who(actor))) throw new CoreError("Only the producer can hand in a version, and only while the job is being worked on.");
  const v = validateLinkUrl(p.url);
  if (!v.ok) throw new CoreError(v.error);
  const template = await prisma.approvalTemplate.findUnique({ where: { documentType: "MULTIMEDIA_VERSION" }, select: { id: true } });
  await wrap(async () => wf.needsReviewer(!!template, j.reviewerId));
  const prev = j.status;
  const versions = await prisma.multimediaVersion.findMany({ where: { jobId: id }, select: { versionNo: true } });
  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.multimediaVersion.create({ data: { jobId: id, versionNo: wf.nextVersionNo(versions.map((x) => x.versionNo)), url: v.url, notes: p.notes?.trim() || null, submittedById: actor.id } });
    const moved = await tx.multimediaJob.updateMany({ where: { id, status: prev }, data: { status: "IN_REVIEW" } });
    if (moved.count !== 1) throw new CoreError("This job just changed. Reload and try again.");
    return created;
  });
  try {
    const steps: StepDef[] | undefined = template ? undefined : [{ label: "Review", approverUserId: j.reviewerId }];
    await submitApproval(actor, { documentType: "MULTIMEDIA_VERSION", documentId: version.id, title: `${j.code} ${j.title} v${version.versionNo}`, steps });
  } catch (e) {
    await prisma.multimediaVersion.delete({ where: { id: version.id } });
    await prisma.multimediaJob.update({ where: { id }, data: { status: prev } });
    throw e;
  }
  await audit(actor.id, "MULTIMEDIA_VERSION_SUBMITTED", "MultimediaJob", id, { versionNo: version.versionNo, url: v.url });
  return version;
}

export async function onMultimediaReviewed(versionId: string, result: "APPROVED" | "REJECTED", reviewerId: string, feedback: string | null) {
  const version = await prisma.multimediaVersion.findUnique({ where: { id: versionId } });
  if (!version) return;
  const out = wf.afterReview(result);
  await prisma.$transaction([
    prisma.multimediaVersion.update({ where: { id: versionId }, data: { status: out.version, feedback, decidedAt: new Date() } }),
    prisma.multimediaJob.updateMany({ where: { id: version.jobId, status: "IN_REVIEW" }, data: { status: out.job } }),
  ]);
  await audit(reviewerId, result === "APPROVED" ? "MULTIMEDIA_VERSION_APPROVED" : "MULTIMEDIA_CHANGES_REQUESTED", "MultimediaJob", version.jobId, { versionNo: version.versionNo, feedback });
}

export async function deliver(actor: MActor, id: string, note: string) {
  const j = await load(id);
  if (!wf.canDeliver(asJob(j), who(actor))) throw new CoreError("This job cannot be delivered yet. The latest version must be approved first.");
  const approved = await prisma.multimediaVersion.findFirst({ where: { jobId: id, status: "APPROVED" }, orderBy: { versionNo: "desc" } });
  if (!approved) throw new CoreError("There is no approved version to deliver.");
  await prisma.multimediaJob.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: new Date(), deliveryNote: note.trim() || null } });
  await audit(actor.id, "MULTIMEDIA_DELIVERED", "MultimediaJob", id, { versionNo: approved.versionNo, url: approved.url });
}

export async function cancelJob(actor: MActor, id: string) {
  const j = await load(id);
  if (!wf.canCancel(asJob(j), who(actor))) throw new CoreError("You cannot cancel this job.");
  if (j.status === "IN_REVIEW") {
    const versions = await prisma.multimediaVersion.findMany({ where: { jobId: id, status: "SUBMITTED" }, select: { id: true } });
    const open = await prisma.approvalRequest.findMany({ where: { documentType: "MULTIMEDIA_VERSION", documentId: { in: versions.map((v) => v.id) }, status: "PENDING" }, select: { id: true } });
    for (const a of open) await cancelApproval({ id: actor.id, role: actor.role }, a.id).catch(() => {});
  }
  // Cancelling frees the resources it had booked.
  await prisma.$transaction([prisma.resourceBooking.deleteMany({ where: { jobId: id } }), prisma.multimediaJob.update({ where: { id }, data: { status: "CANCELLED" } })]);
  await audit(actor.id, "MULTIMEDIA_CANCELLED", "MultimediaJob", id);
}
