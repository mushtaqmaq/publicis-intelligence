"use server";

import { requireMultimediaUser, assertMultimediaStaff } from "@/lib/auth/multimedia";
import { createJob, createResource, setResourceActive } from "@/lib/multimedia/service";
import { withMessage } from "@/lib/core/formErrors";
import { CoreError } from "@/lib/core/service";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createJobAction(formData: FormData) {
  const { actor } = await requireMultimediaUser();
  await withMessage("/multimedia/new", async () => {
    const producerId = str(formData, "producerId") || null, reviewerId = str(formData, "reviewerId") || null;
    if ((producerId || reviewerId) && !actor.manager) throw new CoreError("Only a multimedia manager can assign people when creating a job. Leave them blank and a manager will pick it up.");
    await assertMultimediaStaff([producerId, reviewerId]).catch((e) => { throw new CoreError(e.message); });
    const due = str(formData, "dueDate");
    const j = await createJob(actor, {
      title: str(formData, "title"), jobType: str(formData, "jobType"), brief: str(formData, "brief"), clientId: str(formData, "clientId"),
      campaignId: str(formData, "campaignId") || null, deliverableId: str(formData, "deliverableId") || null, creativeRequestId: str(formData, "creativeRequestId") || null,
      location: str(formData, "location") || null, dueDate: due ? new Date(due + "T00:00:00Z") : null, producerId, reviewerId,
      briefLink: { title: str(formData, "linkTitle"), url: str(formData, "linkUrl") },
    });
    return `/multimedia/${j.id}`;
  });
}

export async function createResourceAction(formData: FormData) {
  const { actor } = await requireMultimediaUser();
  await withMessage("/multimedia/resources", async () => { await createResource(actor, { name: str(formData, "name"), kind: str(formData, "kind"), notes: str(formData, "notes") }); }, "Resource added");
}
export async function toggleResourceAction(formData: FormData) {
  const { actor } = await requireMultimediaUser();
  await withMessage("/multimedia/resources", async () => { await setResourceActive(actor, str(formData, "id"), str(formData, "active") === "1"); });
}
