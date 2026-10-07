"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";

export async function uploadProofAction(formData: FormData) {
  const user = await requireSessionUser();
  const planId = formData.get("planId") as string;
  const mediaPlanItemId = formData.get("mediaPlanItemId") as string;
  const postedDateRaw = formData.get("postedDate") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const file = formData.get("photo") as File | null;

  if (!file || file.size === 0) {
    redirect(`/media/plans/${planId}/proof-of-posting?error=${encodeURIComponent("A photo is required as proof of posting.")}`);
  }
  if (!postedDateRaw) {
    redirect(`/media/plans/${planId}/proof-of-posting?error=${encodeURIComponent("A posted date is required.")}`);
  }

  const buffer = Buffer.from(await file!.arrayBuffer());
  const ext = file!.name.split(".").pop() || "jpg";
  const blob = await put(`proof-of-posting/${mediaPlanItemId}-${Date.now()}.${ext}`, buffer, {
    access: "private",
    addRandomSuffix: true,
  });

  const proof = await prisma.proofOfPosting.create({
    data: {
      mediaPlanItemId,
      photoUrl: blob.url,
      postedDate: new Date(postedDateRaw),
      notes,
      uploadedById: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PROOF_OF_POSTING_UPLOADED",
      entityType: "MediaPlanItem",
      entityId: mediaPlanItemId,
      newValue: { proofId: proof.id, postedDate: postedDateRaw, notes },
    },
  });

  revalidatePath(`/media/plans/${planId}/proof-of-posting`);
  redirect(`/media/plans/${planId}/proof-of-posting`);
}

export async function deleteProofAction(formData: FormData) {
  const user = await requireSessionUser();
  const planId = formData.get("planId") as string;
  const proofId = formData.get("proofId") as string;

  const proof = await prisma.proofOfPosting.findUniqueOrThrow({ where: { id: proofId } });
  await prisma.proofOfPosting.delete({ where: { id: proofId } });
  await del(proof.photoUrl).catch(() => undefined);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PROOF_OF_POSTING_DELETED",
      entityType: "MediaPlanItem",
      entityId: proof.mediaPlanItemId,
      oldValue: { proofId, postedDate: proof.postedDate.toISOString(), notes: proof.notes },
    },
  });

  revalidatePath(`/media/plans/${planId}/proof-of-posting`);
  redirect(`/media/plans/${planId}/proof-of-posting`);
}
