import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { MediaChannel, PricingCalculationMethod } from "@/generated/prisma/enums";
import { getApplicableRatesForAsset } from "./rateResolution";
import { buildAndCalculateLineItem, campaignDaysBetween } from "./buildLineItem";
import { chooseRate, type Candidate } from "./suggestPure";

export type SuggestFilters = { channel?: string; supplierId?: string; q?: string };

type AssetWithSupplier = Prisma.AssetGetPayload<{ include: { supplier: true } }>;

async function candidateFor(asset: AssetWithSupplier, start: Date, end: Date): Promise<Candidate | "norate"> {
  const avail = await getApplicableRatesForAsset(asset.id, start);
  if (!avail.found) return "norate";
  const days = campaignDaysBetween(start, end);
  const rate = chooseRate(avail.rates, days);
  if (!rate) return "norate";
  const { result } = buildAndCalculateLineItem({
    calculationMethod: asset.pricingCalculationMethod as PricingCalculationMethod,
    rate: { grossRateStatus: rate.grossRateStatus, grossRate: rate.grossRate, durationValue: rate.durationValue, durationUnit: rate.durationUnit, fees: rate.fees },
    campaignStart: start, campaignEnd: end, quantity: 1, discountPct: 0, additionalDiscountPct: 0,
  });
  const total = result.lineTotal.status === "KNOWN" && result.lineTotal.amount !== null && !result.excludesPendingCost ? result.lineTotal.amount : null;
  return {
    assetId: asset.id, assetName: asset.assetName, supplier: asset.supplier.name, area: asset.area || asset.locationName || "",
    mediaType: asset.mediaType || "", channel: asset.supplier.mediaChannel, rateId: rate.id, rateYear: avail.rateYear, isFallback: avail.isFallback,
    period: rate.durationValue ? `${rate.durationValue} ${rate.durationUnit ?? ""}`.trim() : "n/a",
    unitCost: total, maxQty: asset.numberOfCircuits ?? asset.numberOfFaces ?? asset.numberOfScreens ?? 1,
  };
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// Deterministic shuffle so a broad search samples across areas and suppliers instead of the alphabet.
function seeded<T>(arr: T[], seedStr: string): T[] {
  let h = 2166136261; for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) / 4294967296);
  return arr.map((v) => [rnd(), v] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

/** Real assets with a published rate for the plan's period, priced for ONE unit with the planner engine. */
export async function buildCandidates(planId: string, filters: SuggestFilters, opts?: { assetIds?: string[]; limit?: number }) {
  const plan = await prisma.mediaPlan.findUniqueOrThrow({ where: { id: planId }, select: { campaignStart: true, campaignEnd: true } });
  const where: Prisma.AssetWhereInput = { status: "ACTIVE", rates: { some: { publishedStatus: "PUBLISHED" } }, supplier: { isActive: true } };
  if (opts?.assetIds) where.id = { in: opts.assetIds };
  else {
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.channel) where.supplier = { isActive: true, mediaChannel: filters.channel as MediaChannel };
    const q = filters.q?.trim();
    if (q) where.OR = [{ assetName: { contains: q, mode: "insensitive" } }, { locationName: { contains: q, mode: "insensitive" } }, { area: { contains: q, mode: "insensitive" } }, { mediaType: { contains: q, mode: "insensitive" } }];
  }
  const found = await prisma.asset.findMany({ where, include: { supplier: true }, take: opts?.assetIds ? undefined : 400 });
  const assets = opts?.assetIds ? found : seeded(found, planId).slice(0, opts?.limit ?? 120);
  const rows = await pool(assets, 8, (a) => candidateFor(a, plan.campaignStart, plan.campaignEnd));
  const candidates = rows.filter((r): r is Candidate => r !== "norate");
  return { candidates, considered: found.length, noRate: rows.length - candidates.length, start: plan.campaignStart, end: plan.campaignEnd };
}
