"use server";

import { requirePlatformUser } from "@/lib/auth/platform";
import { createCampaign } from "@/lib/core/service";
import { withMessage } from "@/lib/core/formErrors";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const date = (f: FormData, k: string) => (str(f, k) ? new Date(str(f, k) + "T00:00:00Z") : null);

export async function createCampaignAction(formData: FormData) {
  const user = await requirePlatformUser();
  await withMessage("/campaigns/new", async () => {
    const budget = str(formData, "budget");
    const c = await createCampaign(user.id, { name: str(formData, "name"), clientId: str(formData, "clientId"), startDate: date(formData, "startDate"), endDate: date(formData, "endDate"), budget: budget ? Number(budget) : null, ownerId: str(formData, "ownerId") || user.id, notes: str(formData, "notes") });
    return `/campaigns/${c.id}`;
  });
}
