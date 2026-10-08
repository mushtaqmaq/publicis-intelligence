"use server";

import { requireCreativeUser, assertCreativeStaff } from "@/lib/auth/creative";
import { assign, cancelRequest, deliver, start, submitVersion } from "@/lib/creative/service";
import { addComment, addLink, removeLink, CoreError } from "@/lib/core/service";
import { withMessage } from "@/lib/core/formErrors";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (id: string) => `/creative/${id}`;

export async function assignAction(formData: FormData) {
  const { actor } = await requireCreativeUser();
  const id = str(formData, "id");
  await withMessage(back(id), async () => {
    const assigneeId = str(formData, "assigneeId") || null, reviewerId = str(formData, "reviewerId") || null;
    await assertCreativeStaff([assigneeId, reviewerId]).catch((e) => { throw new CoreError(e.message); });
    await assign(actor, id, assigneeId, reviewerId);
  }, "Assignment saved");
}
export async function startAction(formData: FormData) {
  const { actor } = await requireCreativeUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await start(actor, id); }, "Started");
}
export async function submitVersionAction(formData: FormData) {
  const { actor } = await requireCreativeUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await submitVersion(actor, id, { url: str(formData, "url"), notes: str(formData, "notes") }); }, "Version sent for review");
}
export async function deliverAction(formData: FormData) {
  const { actor } = await requireCreativeUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await deliver(actor, id, str(formData, "note")); }, "Marked as delivered");
}
export async function cancelRequestAction(formData: FormData) {
  const { actor } = await requireCreativeUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await cancelRequest(actor, id); }, "Request cancelled");
}
export async function addRefLinkAction(formData: FormData) {
  const { user } = await requireCreativeUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await addLink(user.id, { entityType: "CreativeRequest", entityId: id, title: str(formData, "title"), url: str(formData, "url"), kind: str(formData, "kind") || "REFERENCE" }); }, "Link added");
}
export async function removeRefLinkAction(formData: FormData) {
  const { user } = await requireCreativeUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await removeLink(user.id, str(formData, "linkId")); }, "Link removed");
}
export async function commentAction(formData: FormData) {
  const { user } = await requireCreativeUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await addComment(user.id, { entityType: "CreativeRequest", entityId: id, body: str(formData, "body") }); });
}
