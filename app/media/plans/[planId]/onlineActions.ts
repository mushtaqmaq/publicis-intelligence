"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireMediaUser } from "@/lib/auth/modules";
import { sanitizeOnlineData } from "@/lib/planning/online";

// Saves the online/digital block of a plan version. Locked versions are never edited.
export async function saveOnlineBlockAction(planId: string, versionId: string, data: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireMediaUser();
  const version = await prisma.mediaPlanVersion.findUnique({
    where: { id: versionId },
    select: { isLocked: true, mediaPlanId: true, mediaPlan: { select: { planType: true } } },
  });
  if (!version || version.mediaPlanId !== planId) return { ok: false, error: "That plan version was not found." };
  if (version.isLocked) {
    return { ok: false, error: "This plan version is locked (Approved/Booked/Completed plans are never edited after the fact). Create a new version to make changes." };
  }
  if (version.mediaPlan.planType === "OFFLINE") return { ok: false, error: "This is an offline plan; it has no online block." };

  const clean = sanitizeOnlineData(data);
  await prisma.mediaPlanVersion.update({ where: { id: versionId }, data: { onlineData: clean as unknown as Prisma.InputJsonValue } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PLAN_ONLINE_BLOCK_SAVED",
      entityType: "MediaPlanVersion",
      entityId: versionId,
      newValue: { sections: clean.sections.length, rows: clean.sections.reduce((a, s) => a + s.rows.length, 0) },
    },
  });
  revalidatePath(`/media/plans/${planId}`);
  return { ok: true };
}
