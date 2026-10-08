"use server";

import { requireMultimediaUser, assertMultimediaStaff } from "@/lib/auth/multimedia";
import * as svc from "@/lib/multimedia/service";
import { addComment, addLink, removeLink, CoreError } from "@/lib/core/service";
import { withMessage } from "@/lib/core/formErrors";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (id: string) => `/multimedia/${id}`;
const when = (f: FormData, k: string) => { const v = str(f, k); return v ? new Date(v + ":00Z") : new Date(NaN); }; // datetime-local, treated as UTC

export async function setProducerAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => {
    const producerId = str(formData, "producerId") || null, reviewerId = str(formData, "reviewerId") || null;
    await assertMultimediaStaff([producerId, reviewerId]).catch((e) => { throw new CoreError(e.message); });
    await svc.setProducer(actor, id, producerId, reviewerId);
  }, "Saved");
}
export async function scheduleAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await svc.schedule(actor, id, { startsAt: when(formData, "startsAt"), endsAt: when(formData, "endsAt"), location: str(formData, "location") || null }); }, "Scheduled");
}
export async function startAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await svc.start(actor, id); }, "Started");
}
export async function addTaskAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => {
    const assigneeId = str(formData, "assigneeId") || null;
    await assertMultimediaStaff([assigneeId]).catch((e) => { throw new CoreError(e.message); });
    const due = str(formData, "dueDate");
    await svc.addTask(actor, id, { title: str(formData, "title"), assigneeId, dueDate: due ? new Date(due + "T00:00:00Z") : null });
  });
}
export async function taskStatusAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await svc.setTaskStatus(actor, str(formData, "taskId"), str(formData, "status")); });
}
export async function bookAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await svc.bookResource(actor, id, { resourceId: str(formData, "resourceId"), startsAt: when(formData, "startsAt"), endsAt: when(formData, "endsAt"), note: str(formData, "note") }); }, "Booked");
}
export async function unbookAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await svc.removeBooking(actor, str(formData, "bookingId")); }, "Booking removed");
}
export async function submitVersionAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await svc.submitVersion(actor, id, { url: str(formData, "url"), notes: str(formData, "notes") }); }, "Version sent for review");
}
export async function deliverAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await svc.deliver(actor, id, str(formData, "note")); }, "Marked as delivered");
}
export async function cancelJobAction(formData: FormData) {
  const { actor } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await svc.cancelJob(actor, id); }, "Job cancelled");
}
export async function addRefLinkAction(formData: FormData) {
  const { user } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await addLink(user.id, { entityType: "MultimediaJob", entityId: id, title: str(formData, "title"), url: str(formData, "url"), kind: str(formData, "kind") || "REFERENCE" }); }, "Link added");
}
export async function removeRefLinkAction(formData: FormData) {
  const { user } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await removeLink(user.id, str(formData, "linkId")); }, "Link removed");
}
export async function commentAction(formData: FormData) {
  const { user } = await requireMultimediaUser(); const id = str(formData, "id");
  await withMessage(back(id), async () => { await addComment(user.id, { entityType: "MultimediaJob", entityId: id, body: str(formData, "body") }); });
}
