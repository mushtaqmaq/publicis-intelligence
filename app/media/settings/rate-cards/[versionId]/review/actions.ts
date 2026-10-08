"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publishRateChange, rejectRateChange, publishAllEligible, PublishRequiresDecisionError } from "@/lib/ingestion/publish";
import { requireMediaUser } from "@/lib/auth/modules";
import type { ReconciliationAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { MoneyStatus } from "@/lib/ingestion/normalize";

interface EditableNewValue {
  grossRate: number | null;
  grossRateStatus: MoneyStatus;
  durationValue: number | null;
  durationUnit: string | null;
  quantityLabel: string | null;
  sourcePage: number | null;
  [key: string]: unknown;
}

export async function editCandidateAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  const rateChangeId = formData.get("rateChangeId") as string;
  const versionId = formData.get("versionId") as string;

  const change = await prisma.rateChange.findUniqueOrThrow({ where: { id: rateChangeId } });
  if (change.decision !== "PENDING") {
    redirect(`/media/settings/rate-cards/${versionId}/review?error=` + encodeURIComponent("Only a pending candidate can be edited."));
  }

  const candidateAssetName = (formData.get("candidateAssetName") as string)?.trim();
  const candidateLocation = (formData.get("candidateLocation") as string)?.trim() || null;
  if (!candidateAssetName) {
    redirect(`/media/settings/rate-cards/${versionId}/review?error=` + encodeURIComponent("Asset name cannot be empty."));
  }

  const grossRateStatus = formData.get("grossRateStatus") as MoneyStatus;
  const grossRateRaw = formData.get("grossRate") as string;
  const durationValueRaw = formData.get("durationValue") as string;
  const durationUnit = (formData.get("durationUnit") as string)?.trim() || null;
  const quantityLabel = (formData.get("quantityLabel") as string)?.trim() || null;
  const sourcePageRaw = formData.get("sourcePage") as string;

  const oldValue = change.newValue as unknown as EditableNewValue;
  const newValue: EditableNewValue = {
    ...oldValue,
    grossRate: grossRateStatus === "KNOWN" && grossRateRaw ? Number(grossRateRaw) : null,
    grossRateStatus,
    durationValue: durationValueRaw ? Number(durationValueRaw) : null,
    durationUnit,
    quantityLabel: quantityLabel || null,
    sourcePage: sourcePageRaw ? Number(sourcePageRaw) : null,
  };

  await prisma.rateChange.update({
    where: { id: rateChangeId },
    data: {
      candidateAssetName,
      candidateLocation,
      newValue: newValue as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "RATE_CHANGE_EDITED",
      entityType: "RateChange",
      entityId: rateChangeId,
      oldValue: { candidateAssetName: change.candidateAssetName, candidateLocation: change.candidateLocation, ...oldValue } as unknown as Prisma.InputJsonValue,
      newValue: { candidateAssetName, candidateLocation, ...newValue } as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/media/settings/rate-cards/${versionId}/review`);
  redirect(`/media/settings/rate-cards/${versionId}/review`);
}

export async function publishOneAction(rateChangeId: string, versionId: string) {
  const user = await requireMediaUser("settings");
  try {
    await publishRateChange(rateChangeId, { userId: user.id });
  } catch (err) {
    if (err instanceof PublishRequiresDecisionError) {
      redirect(`/media/settings/rate-cards/${versionId}/review?error=` + encodeURIComponent(err.message));
    }
    throw err;
  }
  revalidatePath(`/media/settings/rate-cards/${versionId}/review`);
}

export async function publishAsNewAssetAction(rateChangeId: string, versionId: string) {
  const user = await requireMediaUser("settings");
  await publishRateChange(rateChangeId, { forceNewAsset: true, userId: user.id });
  revalidatePath(`/media/settings/rate-cards/${versionId}/review`);
}

export async function mergeIntoAssetAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  const rateChangeId = formData.get("rateChangeId") as string;
  const versionId = formData.get("versionId") as string;
  const mergeIntoAssetId = formData.get("mergeIntoAssetId") as string;

  if (!mergeIntoAssetId) {
    redirect(
      `/media/settings/rate-cards/${versionId}/review?error=` + encodeURIComponent("Pick an existing asset to merge into first.")
    );
  }

  await publishRateChange(rateChangeId, { mergeIntoAssetId, userId: user.id });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "RATE_CHANGE_MERGED_INTO_ASSET",
      entityType: "RateChange",
      entityId: rateChangeId,
      newValue: { mergeIntoAssetId },
    },
  });

  revalidatePath(`/media/settings/rate-cards/${versionId}/review`);
}

export async function rejectOneAction(rateChangeId: string, versionId: string) {
  const user = await requireMediaUser("settings");
  await rejectRateChange(rateChangeId, user.id);
  revalidatePath(`/media/settings/rate-cards/${versionId}/review`);
}

export async function publishAllAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  const versionId = formData.get("versionId") as string;
  const result = await publishAllEligible(versionId, user.id);
  if (result.skipped.length > 0) {
    const names = result.skipped.map((s) => s.candidateAssetName).join(", ");
    redirect(
      `/media/settings/rate-cards/${versionId}/review?error=` +
        encodeURIComponent(
          `Published ${result.published} of ${result.total}. Skipped ${result.skipped.length} that looked like ` +
            `possible duplicates and need a manual Merge/Publish-as-new decision: ${names}.`
        )
    );
  }
  redirect(`/media/settings/rate-cards/${versionId}/review`);
}

export async function resolveReconciliationAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  const reconciliationId = formData.get("reconciliationId") as string;
  const versionId = formData.get("versionId") as string;
  const recommendedAction = formData.get("recommendedAction") as ReconciliationAction;
  const resolutionNotes = (formData.get("resolutionNotes") as string)?.trim();

  if (!resolutionNotes) {
    redirect(
      `/media/settings/rate-cards/${versionId}/review?error=` +
        encodeURIComponent("A resolution note is required to mark a reconciliation resolved.")
    );
  }

  await prisma.reconciliation.update({
    where: { id: reconciliationId },
    data: {
      status: "RESOLVED",
      recommendedAction,
      resolvedById: user.id,
      resolvedAt: new Date(),
      resolutionNotes,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "RECONCILIATION_RESOLVED",
      entityType: "Reconciliation",
      entityId: reconciliationId,
      newValue: { recommendedAction, resolutionNotes },
    },
  });

  revalidatePath(`/media/settings/rate-cards/${versionId}/review`);
}
