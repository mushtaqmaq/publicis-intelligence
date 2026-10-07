"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";

function generatePlanCode(campaignName: string, start: Date): string {
  const slug = campaignName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  return `${slug || "PLAN"}-${start.getUTCFullYear()}-${Date.now().toString(36).toUpperCase()}`;
}

export async function createMediaPlanAction(formData: FormData) {
  const user = await requireSessionUser();
  const clientName = (formData.get("clientName") as string)?.trim();
  const campaignName = (formData.get("campaignName") as string)?.trim();
  const campaignStartRaw = formData.get("campaignStart") as string;
  const campaignEndRaw = formData.get("campaignEnd") as string;

  if (!clientName || !campaignName || !campaignStartRaw || !campaignEndRaw) {
    redirect(
      "/media/plans/new?error=" +
        encodeURIComponent("Client, Campaign Name, Campaign Start, and Campaign End are required.")
    );
  }

  const campaignStart = new Date(campaignStartRaw);
  const campaignEnd = new Date(campaignEndRaw);
  if (campaignEnd < campaignStart) {
    redirect("/media/plans/new?error=" + encodeURIComponent("Campaign End must be on or after Campaign Start."));
  }

  const client = await prisma.client.upsert({
    where: { name: clientName },
    update: {},
    create: { name: clientName },
  });

  const budgetRaw = formData.get("budget") as string;

  const plan = await prisma.mediaPlan.create({
    data: {
      planCode: generatePlanCode(campaignName, campaignStart),
      clientId: client.id,
      campaignName,
      campaignId: (formData.get("campaignId") as string)?.trim() || null,
      brand: (formData.get("brand") as string)?.trim() || null,
      campaignStart,
      campaignEnd,
      budget: budgetRaw ? Number(budgetRaw) : null,
      currency: (formData.get("currency") as string) || "QAR",
      objective: (formData.get("objective") as string)?.trim() || null,
      targetAudience: (formData.get("targetAudience") as string)?.trim() || null,
      targetLocations: (formData.get("targetLocations") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      createdById: user.id,
      versions: {
        create: { versionNumber: 1, label: "V1", createdById: user.id },
      },
    },
    include: { versions: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PLAN_CREATED",
      entityType: "MediaPlan",
      entityId: plan.id,
      newValue: { campaignName, clientName, campaignStart: campaignStartRaw, campaignEnd: campaignEndRaw },
    },
  });

  redirect(`/media/plans/${plan.id}`);
}
