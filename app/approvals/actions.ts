"use server";

import { requirePlatformUser } from "@/lib/auth/platform";
import { prisma } from "@/lib/prisma";
import { actOnApproval, cancelApproval, CoreError, saveApprovalTemplate } from "@/lib/core/service";
import { afterDecision } from "@/lib/core/afterDecision";
import { withMessage } from "@/lib/core/formErrors";
import type { Role, StepDef } from "@/lib/core/approvals";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ROLES = ["SUPER_ADMIN", "ADMIN", "ACCOUNT_MANAGER", "PLANNER", "VIEWER"];

export async function decideAction(formData: FormData) {
  const user = await requirePlatformUser();
  await withMessage("/approvals", async () => {
    const requestId = str(formData, "requestId");
    const action = str(formData, "action") === "REJECT" ? "REJECT" : "APPROVE";
    await actOnApproval({ id: user.id, role: user.role }, requestId, action, str(formData, "comment"));
    await afterDecision(requestId, user.id);
  }, "Decision recorded");
}

export async function cancelAction(formData: FormData) {
  const user = await requirePlatformUser();
  await withMessage("/approvals", async () => { await cancelApproval({ id: user.id, role: user.role }, str(formData, "requestId")); }, "Request cancelled");
}

// Admin: set the ordered approvers for a document type. Up to 4 steps; each is a person or a role; blank rows are ignored.
export async function saveTemplateAction(formData: FormData) {
  const user = await requirePlatformUser({ admin: true });
  await withMessage("/approvals/settings", async () => {
    const documentType = str(formData, "documentType");
    const steps: StepDef[] = [];
    for (let i = 1; i <= 4; i++) {
      const label = str(formData, `label${i}`), who = str(formData, `who${i}`), min = str(formData, `min${i}`);
      if (!label && !who) continue;
      if (!who) throw new CoreError(`Step ${i} needs an approver.`);
      const isRole = who.startsWith("role:");
      if (isRole && !ROLES.includes(who.slice(5))) throw new CoreError(`Step ${i}: unknown role.`);
      if (!isRole && !(await prisma.user.findFirst({ where: { id: who, isActive: true }, select: { id: true } }))) throw new CoreError(`Step ${i}: that person was not found.`);
      steps.push({ label: label || `Step ${i}`, approverUserId: isRole ? null : who, approverRole: isRole ? (who.slice(5) as Role) : null, minAmount: min ? Number(min) : null });
    }
    await saveApprovalTemplate(user.id, documentType, str(formData, "name") || documentType, steps);
  }, "Approval steps saved");
}
