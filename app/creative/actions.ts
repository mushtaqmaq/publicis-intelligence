"use server";

import { requireCreativeUser, assertCreativeStaff } from "@/lib/auth/creative";
import { createRequest } from "@/lib/creative/service";
import { withMessage } from "@/lib/core/formErrors";
import { CoreError } from "@/lib/core/service";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createRequestAction(formData: FormData) {
  const { actor } = await requireCreativeUser();
  await withMessage("/creative/new", async () => {
    const assigneeId = str(formData, "assigneeId") || null, reviewerId = str(formData, "reviewerId") || null;
    if ((assigneeId || reviewerId) && !actor.manager) throw new CoreError("Only a creative manager can assign people. Leave the designer blank and a manager will pick it up.");
    await assertCreativeStaff([assigneeId, reviewerId]).catch((e) => { throw new CoreError(e.message); });
    const due = str(formData, "dueDate");
    const r = await createRequest(actor, {
      title: str(formData, "title"), kind: str(formData, "kind"), brief: str(formData, "brief"), priority: str(formData, "priority"), clientId: str(formData, "clientId"),
      campaignId: str(formData, "campaignId") || null, deliverableId: str(formData, "deliverableId") || null, dueDate: due ? new Date(due + "T00:00:00Z") : null, assigneeId, reviewerId,
      briefLinks: [{ title: str(formData, "linkTitle"), url: str(formData, "linkUrl") }],
    });
    return `/creative/${r.id}`;
  });
}
