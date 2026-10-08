// Multimedia job workflow rules (pure). The database wrapper is service.ts.
//   PLANNED -> SCHEDULED -> IN_PROGRESS -> IN_REVIEW -> APPROVED -> DELIVERED
//                               ^              |
//                               +-- CHANGES_REQUESTED
//   CANCELLED from anywhere before DELIVERED.
export type MStatus = "PLANNED" | "SCHEDULED" | "IN_PROGRESS" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "DELIVERED" | "CANCELLED";
export const JOB_TYPES = ["PHOTO_SHOOT", "VIDEO_SHOOT", "VOICE_OVER", "EDITING", "POST_PRODUCTION", "OTHER"] as const;
export const RESOURCE_KINDS = ["CREW", "EQUIPMENT", "LOCATION", "STUDIO", "TALENT"] as const;
export const TASK_STATUSES = ["TODO", "DOING", "DONE", "BLOCKED"] as const;

export class WorkflowError extends Error {}
export type Job = { status: MStatus; requestedById: string; producerId: string | null; reviewerId: string | null };
export type Who = { id: string; manager: boolean };

const closed = (s: MStatus) => s === "DELIVERED" || s === "CANCELLED";
const owns = (j: Job, w: Who) => w.manager || w.id === j.producerId;

// Planning (producer, scheduling, bookings, tasks): the job's producer, its requester, or a manager.
export const canPlan = (j: Job, w: Who) => !closed(j.status) && (owns(j, w) || w.id === j.requestedById);
export const canSchedule = (j: Job, w: Who) => canPlan(j, w) && (j.status === "PLANNED" || j.status === "SCHEDULED");
export const canStart = (j: Job, w: Who) => j.status === "SCHEDULED" && owns(j, w);
export const canSubmit = (j: Job, w: Who) => (j.status === "IN_PROGRESS" || j.status === "CHANGES_REQUESTED") && owns(j, w);
export const canDeliver = (j: Job, w: Who) => j.status === "APPROVED" && owns(j, w);
export const canCancel = (j: Job, w: Who) => !closed(j.status) && (w.manager || w.id === j.requestedById || w.id === j.producerId);

export function checkProducer(producerId: string | null, reviewerId: string | null) {
  if (reviewerId && !producerId) throw new WorkflowError("Choose the producer before the reviewer.");
  if (reviewerId && reviewerId === producerId) throw new WorkflowError("The reviewer must be someone other than the producer.");
}
export function needsReviewer(hasTemplate: boolean, reviewerId: string | null) {
  if (!hasTemplate && !reviewerId) throw new WorkflowError("Choose a reviewer first (or ask an admin to set approval steps for Multimedia review).");
}
export const nextVersionNo = (existing: number[]) => (existing.length ? Math.max(...existing) + 1 : 1);
export function afterReview(result: "APPROVED" | "REJECTED"): { job: MStatus; version: "APPROVED" | "CHANGES_REQUESTED" } {
  return result === "APPROVED" ? { job: "APPROVED", version: "APPROVED" } : { job: "CHANGES_REQUESTED", version: "CHANGES_REQUESTED" };
}
export const isOverdue = (due: Date | null, status: MStatus, now = new Date()) => !!due && !closed(status) && status !== "APPROVED" && due.getTime() < now.getTime();

// ---- Scheduling ---------------------------------------------------------------------------------------------
export type Slot = { startsAt: Date; endsAt: Date };
export function checkSlot(s: Slot) {
  if (!(s.startsAt instanceof Date) || isNaN(s.startsAt.getTime()) || !(s.endsAt instanceof Date) || isNaN(s.endsAt.getTime())) throw new WorkflowError("Enter a start and an end time.");
  if (s.endsAt <= s.startsAt) throw new WorkflowError("The end must be after the start.");
  if (s.endsAt.getTime() - s.startsAt.getTime() > 31 * 864e5) throw new WorkflowError("A single booking can be at most 31 days.");
}
// Back-to-back bookings (one ends exactly when the next starts) do not conflict.
export const overlaps = (a: Slot, b: Slot) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;
export const findConflicts = <T extends Slot>(wanted: Slot, existing: T[]) => existing.filter((e) => overlaps(wanted, e));

export function taskProgress(tasks: { status: string }[]) {
  const done = tasks.filter((t) => t.status === "DONE").length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}
