// Creative request workflow rules (pure). The database wrapper is service.ts.
//   NEW -> ASSIGNED -> IN_PROGRESS -> IN_REVIEW -> APPROVED -> DELIVERED
//                          ^              |
//                          +-- CHANGES_REQUESTED (reviewer sent it back; a new version goes to review again)
//   CANCELLED from anywhere before DELIVERED.
export type CStatus = "NEW" | "ASSIGNED" | "IN_PROGRESS" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "DELIVERED" | "CANCELLED";
export const KINDS = ["DESIGN", "SOCIAL", "PRINT", "OOH", "VIDEO_STORYBOARD", "OTHER"] as const;
export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export class WorkflowError extends Error {}

export type Req = { status: CStatus; requestedById: string; assigneeId: string | null; reviewerId: string | null };
export type Who = { id: string; manager: boolean }; // manager = admin or holds creative.manage

const closed = (s: CStatus) => s === "DELIVERED" || s === "CANCELLED";

// The requester and managers may assign. The designer must differ from the reviewer (maker-checker).
export function canAssign(r: Req, w: Who) { return !closed(r.status) && (w.manager || w.id === r.requestedById); }
export function checkAssignment(assigneeId: string | null, reviewerId: string | null) {
  if (!assigneeId) throw new WorkflowError("Choose a designer.");
  if (reviewerId && reviewerId === assigneeId) throw new WorkflowError("The reviewer must be someone other than the designer.");
}
export function statusAfterAssign(s: CStatus): CStatus { return s === "NEW" ? "ASSIGNED" : s; }

export function canStart(r: Req, w: Who) { return r.status === "ASSIGNED" && r.assigneeId === w.id; }
export function canSubmit(r: Req, w: Who) { return (r.status === "IN_PROGRESS" || r.status === "CHANGES_REQUESTED") && r.assigneeId === w.id; }
export function canDeliver(r: Req, w: Who) { return r.status === "APPROVED" && (r.assigneeId === w.id || w.manager || r.requestedById === w.id); }
export function canCancel(r: Req, w: Who) { return !closed(r.status) && (w.manager || r.requestedById === w.id); }

// A review step needs someone to review: the configured approval steps, or else the named reviewer.
export function needsReviewer(hasTemplate: boolean, reviewerId: string | null) {
  if (!hasTemplate && !reviewerId) throw new WorkflowError("Choose a reviewer first (or ask an admin to set approval steps for Creative).");
}

export function nextVersionNo(existing: number[]) { return existing.length ? Math.max(...existing) + 1 : 1; }

// Outcome of the approval on a version.
export function afterReview(result: "APPROVED" | "REJECTED"): { request: CStatus; version: "APPROVED" | "CHANGES_REQUESTED" } {
  return result === "APPROVED" ? { request: "APPROVED", version: "APPROVED" } : { request: "CHANGES_REQUESTED", version: "CHANGES_REQUESTED" };
}

export const isOverdue = (due: Date | null, status: CStatus, now = new Date()) => !!due && !closed(status) && status !== "APPROVED" && due.getTime() < now.getTime();
