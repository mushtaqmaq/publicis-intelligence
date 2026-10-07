import "server-only";
import { prisma } from "@/lib/prisma";
import { sanitizeOnlineData, DEFAULT_FX } from "./online";
import type { AgencyPlan, AgencyOfflineGroup } from "./agencyWorkbook";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Loads one plan version and shapes it for the agency-format workbook. */
export async function gatherAgencyPlan(planId: string, versionId: string | null): Promise<{ plan: AgencyPlan; clientName: string; campaign: string } | null> {
  const plan = await prisma.mediaPlan.findUnique({
    where: { id: planId },
    include: { client: true, versions: { orderBy: { versionNumber: "desc" }, select: { id: true } } },
  });
  if (!plan || plan.versions.length === 0) return null;
  const vid = (versionId && plan.versions.find((v) => v.id === versionId)?.id) || plan.versions[0].id;
  const version = await prisma.mediaPlanVersion.findUniqueOrThrow({
    where: { id: vid },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { asset: { include: { supplier: true, mediaCategory: true } } },
      },
    },
  });

  const planType = (plan.planType === "ONLINE" || plan.planType === "HYBRID" ? plan.planType : "OFFLINE") as AgencyPlan["planType"];
  const online = planType !== "OFFLINE" && version.onlineData ? sanitizeOnlineData(version.onlineData) : null;

  let offline: AgencyPlan["offline"] = null;
  if (planType !== "ONLINE" && version.items.length > 0) {
    const groups = new Map<string, AgencyOfflineGroup>();
    let agencyFee = 0;
    for (const it of version.items) {
      const type = it.asset.mediaType || it.asset.mediaCategory.name;
      const key = `${type}|${it.asset.supplier.name}`;
      if (!groups.has(key)) groups.set(key, { name: type, vendor: it.asset.supplier.name, rows: [] });
      const fees = [it.productionFee, it.uploadFee, it.installationFee, it.serviceFee, it.otherFees].reduce<number>((a, f) => a + (num(f) ?? 0), 0);
      groups.get(key)!.rows.push({
        asset: it.asset.assetName,
        location: [it.asset.locationName, it.asset.area].filter(Boolean).join(", "),
        start: iso(it.startDate), end: iso(it.endDate),
        qty: it.selectedCircuits, faces: it.selectedFaces ?? it.asset.numberOfFaces,
        gross: num(it.grossCost), net: num(it.netMedia), fees, total: num(it.lineTotal),
        pending: it.excludesPendingCost,
      });
      agencyFee += num(it.agencyFeeAmount) ?? 0;
    }
    offline = { groups: [...groups.values()], agencyFee };
  }

  return {
    clientName: plan.client.name, campaign: plan.campaignName,
    plan: {
      planType,
      header: {
        client: plan.client.name, reference: plan.planCode, brand: plan.brand ?? "", campaign: plan.campaignName,
        start: iso(plan.campaignStart), end: iso(plan.campaignEnd), market: "Qatar", planDate: iso(plan.createdAt),
        fx: online ? Number(online.fx) || DEFAULT_FX : DEFAULT_FX,
      },
      online, offline,
      termsOnline: online?.terms,
    },
  };
}

export const agencyFilename = (client: string, campaign: string) =>
  `${client} - ${campaign}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, " ").slice(0, 100) + ".xlsx";
