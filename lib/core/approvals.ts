// Multi-step approvals assigned to named people or roles. Pure rules: the database wrapper is in service.ts.
//   - steps run in order; only the current step can be acted on
//   - nobody approves their own request (maker-checker)
//   - a rejection ends the request; the remaining steps are skipped
export type Role = "SUPER_ADMIN" | "ADMIN" | "ACCOUNT_MANAGER" | "PLANNER" | "VIEWER";
export type StepDef = { label: string; approverUserId?: string | null; approverRole?: Role | null; minAmount?: number | null };
export type StepStatus = "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
export type Step = { stepOrder: number; label: string; approverUserId: string | null; approverRole: Role | null; status: StepStatus };
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type Actor = { id: string; role: Role };

export class ApprovalError extends Error {}

// The steps that apply to this amount, numbered from 1. The first one is PENDING, the rest WAITING.
export function buildSteps(defs: StepDef[], amount: number | null, requestedById: string): Step[] {
  const applicable = defs.filter((d) => d.minAmount == null || (amount != null && amount >= d.minAmount));
  if (applicable.length === 0) throw new ApprovalError("No approval steps are set up for this document type. Ask an admin to configure them.");
  applicable.forEach((d, i) => {
    if (!d.approverUserId && !d.approverRole) throw new ApprovalError(`Step ${i + 1} (${d.label}) has no approver.`);
    if (d.approverUserId && d.approverUserId === requestedById) throw new ApprovalError(`Step ${i + 1} (${d.label}) is assigned to you. Nobody approves their own request: choose another approver.`);
  });
  return applicable.map((d, i) => ({ stepOrder: i + 1, label: d.label, approverUserId: d.approverUserId ?? null, approverRole: d.approverUserId ? null : (d.approverRole ?? null), status: i === 0 ? "PENDING" : "WAITING" }));
}

export const currentStep = (steps: Step[]) => steps.find((s) => s.status === "PENDING") ?? null;

export function canAct(step: Step | null, actor: Actor, requestedById: string): boolean {
  if (!step || step.status !== "PENDING") return false;
  if (actor.id === requestedById) return false;
  return step.approverUserId ? step.approverUserId === actor.id : step.approverRole === actor.role;
}

export type Decision = { steps: Step[]; status: RequestStatus; actedStepOrder: number };

export function decide(steps: Step[], status: RequestStatus, action: "APPROVE" | "REJECT", actor: Actor, requestedById: string, comment?: string): Decision {
  if (status !== "PENDING") throw new ApprovalError("This request is already closed.");
  const cur = currentStep(steps);
  if (!cur) throw new ApprovalError("There is no step waiting for a decision.");
  if (actor.id === requestedById) throw new ApprovalError("You cannot approve or reject your own request.");
  if (!canAct(cur, actor, requestedById)) throw new ApprovalError(`This step (${cur.label}) is assigned to someone else.`);
  if (action === "REJECT" && !String(comment ?? "").trim()) throw new ApprovalError("Give a reason when rejecting.");
  const next = steps.map((s) => ({ ...s }));
  const me = next.find((s) => s.stepOrder === cur.stepOrder)!;
  if (action === "REJECT") {
    me.status = "REJECTED";
    next.forEach((s) => { if (s.status === "WAITING") s.status = "SKIPPED"; });
    return { steps: next, status: "REJECTED", actedStepOrder: me.stepOrder };
  }
  me.status = "APPROVED";
  const following = next.find((s) => s.status === "WAITING");
  if (following) { following.status = "PENDING"; return { steps: next, status: "PENDING", actedStepOrder: me.stepOrder }; }
  return { steps: next, status: "APPROVED", actedStepOrder: me.stepOrder };
}

// Only the requester (or an admin) can withdraw a request that is still open.
export function cancel(steps: Step[], status: RequestStatus, actor: Actor, requestedById: string): Decision {
  if (status !== "PENDING") throw new ApprovalError("This request is already closed.");
  const admin = actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
  if (actor.id !== requestedById && !admin) throw new ApprovalError("Only the person who asked, or an admin, can cancel this request.");
  const next = steps.map((s) => ({ ...s, status: (s.status === "PENDING" || s.status === "WAITING" ? "SKIPPED" : s.status) as StepStatus }));
  return { steps: next, status: "CANCELLED", actedStepOrder: 0 };
}
