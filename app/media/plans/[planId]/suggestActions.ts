"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { buildCandidates, type SuggestFilters } from "@/lib/planning/suggest";
import { priceAssetLine } from "@/lib/planning/planItem";
import { chooseRate, validatePicks, clampQty, type Candidate, type Pick } from "@/lib/planning/suggestPure";
import { getApplicableRatesForAsset } from "@/lib/planning/rateResolution";

type Err = { ok: false; error: string };
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

async function editableVersion(planId: string, versionId: string): Promise<{ ok: true; start: Date; end: Date; type: string; budget: number | null; client: string } | Err> {
  const v = await prisma.mediaPlanVersion.findUnique({
    where: { id: versionId },
    select: { isLocked: true, mediaPlanId: true, mediaPlan: { select: { planType: true, campaignStart: true, campaignEnd: true, budget: true, client: { select: { name: true } } } } },
  });
  if (!v || v.mediaPlanId !== planId) return { ok: false, error: "That plan version was not found." };
  if (v.isLocked) return { ok: false, error: "This plan version is locked. Create a new version to add lines." };
  if (v.mediaPlan.planType === "ONLINE") return { ok: false, error: "This is an online plan; it has no inventory lines." };
  return { ok: true, start: v.mediaPlan.campaignStart, end: v.mediaPlan.campaignEnd, type: v.mediaPlan.planType, budget: v.mediaPlan.budget ? Number(v.mediaPlan.budget) : null, client: v.mediaPlan.client.name };
}

/** Step 1: the real inventory catalogue (priced for one unit over the campaign) the AI may choose from. */
export async function getSuggestionCatalogueAction(planId: string, versionId: string, filters: SuggestFilters): Promise<{ ok: true; candidates: Candidate[]; considered: number; noRate: number; start: string; end: string; budget: number | null; client: string } | Err> {
  await requireMediaUser();
  const ctx = await editableVersion(planId, versionId);
  if (!ctx.ok) return ctx;
  const c = await buildCandidates(planId, { channel: filters.channel || undefined, supplierId: filters.supplierId || undefined, q: filters.q || undefined });
  if (!c.candidates.length) return { ok: false, error: "No inventory with a published rate matched. Try fewer filters." };
  return { ok: true, candidates: c.candidates, considered: c.considered, noRate: c.noRate, start: fmtDate(ctx.start), end: fmtDate(ctx.end), budget: ctx.budget, client: ctx.client };
}

export type PricedRow = { assetId: string; assetName: string; supplier: string; area: string; period: string; qty: number; maxQty: number; gross: number | null; net: number | null; fees: number; total: number | null; pending: boolean; why?: string };

/** Step 2: validate the AI's picks against the REAL catalogue and price every one with the planner engine. */
export async function priceSuggestionAction(planId: string, versionId: string, picks: Pick[]): Promise<{ ok: true; rows: PricedRow[]; dropped: { assetId: string; reason: string }[]; total: number; anyPending: boolean } | Err> {
  await requireMediaUser();
  const ctx = await editableVersion(planId, versionId);
  if (!ctx.ok) return ctx;
  const ids = [...new Set(picks.map((p) => String(p.assetId)))].slice(0, 80);
  const { candidates } = await buildCandidates(planId, {}, { assetIds: ids });
  const { lines, dropped } = validatePicks(picks, candidates);
  const byId = new Map(candidates.map((c) => [c.assetId, c]));
  const rows: PricedRow[] = [];
  for (const l of lines) {
    const c = byId.get(l.assetId)!;
    const p = await priceAssetLine({ assetId: l.assetId, assetRateId: c.rateId, start: ctx.start, end: ctx.end, quantity: l.qty, discountPct: 0, additionalDiscountPct: 0 });
    const fees = [p.data.productionFee, p.data.uploadFee, p.data.installationFee, p.data.serviceFee, p.data.otherFees].reduce<number>((a, f) => a + (f ?? 0), 0);
    rows.push({ assetId: l.assetId, assetName: c.assetName, supplier: c.supplier, area: c.area, period: c.period, qty: l.qty, maxQty: c.maxQty, gross: p.data.grossCost, net: p.data.netMedia, fees, total: p.data.lineTotal, pending: p.data.excludesPendingCost, why: l.why });
  }
  return { ok: true, rows, dropped, total: rows.reduce((a, r) => a + (r.total ?? 0), 0), anyPending: rows.some((r) => r.pending) };
}

/** Step 3: add the lines the planner ticked. Prices are recomputed here; nothing from the browser is trusted. */
export async function addSuggestionsAction(planId: string, versionId: string, lines: { assetId: string; qty: number }[]): Promise<{ ok: true; added: number } | Err> {
  const user = await requireMediaUser();
  const ctx = await editableVersion(planId, versionId);
  if (!ctx.ok) return ctx;
  const ids = [...new Set(lines.map((l) => String(l.assetId)))].slice(0, 80);
  if (!ids.length) return { ok: false, error: "Nothing selected." };
  let sortOrder = await prisma.mediaPlanItem.count({ where: { mediaPlanVersionId: versionId } });
  let added = 0;
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.assetId)) continue; seen.add(l.assetId);
    const asset = await prisma.asset.findFirst({ where: { id: l.assetId, status: "ACTIVE" }, include: { supplier: true } });
    if (!asset) continue;
    const avail = await getApplicableRatesForAsset(asset.id, ctx.start);
    const rate = avail.found ? chooseRate(avail.rates, Math.round((ctx.end.getTime() - ctx.start.getTime()) / 864e5) + 1) : null;
    if (!rate) continue;
    const qty = clampQty(l.qty, asset.numberOfCircuits ?? asset.numberOfFaces ?? asset.numberOfScreens ?? 1);
    const p = await priceAssetLine({ assetId: asset.id, assetRateId: rate.id, start: ctx.start, end: ctx.end, quantity: qty, discountPct: 0, additionalDiscountPct: 0 });
    if (p.data.lineTotal === null) continue; // never add a line whose total is unknown (TBD/POA) from a suggestion
    const item = await prisma.mediaPlanItem.create({
      data: { mediaPlanVersionId: versionId, assetId: asset.id, sortOrder: sortOrder++, startDate: ctx.start, endDate: ctx.end, selectedCircuits: qty, discountPct: 0, additionalDiscountPct: 0, ...p.data, notes: "Added from inventory suggestions" },
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "PLAN_ITEM_ADDED", entityType: "MediaPlanItem", entityId: item.id, newValue: { planId, versionId, assetId: asset.id, quantity: qty, lineTotal: p.data.lineTotal, source: "inventory-suggestion" } } });
    added++;
  }
  revalidatePath(`/media/plans/${planId}`);
  return { ok: true, added };
}
