"use server";

import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { parseMediaPlanExcel, type ParsedMediaPlan } from "@/lib/ingestion/parseMediaPlanExcel";
import type { MediaChannel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type { ParsedMediaPlan };

const GENERIC_DIGITAL_ASSET_CODE = "DIGITAL-IMPORT-SUMMARY";
const GENERIC_DIGITAL_SUPPLIER_NAME = "Historical Digital Import";

// Human-readable label per channel, used to build the generic supplier
// name/asset name/code for that channel's historical imports.
const CHANNEL_LABEL: Record<MediaChannel, string> = {
  DIGITAL: "Digital",
  OOH: "OOH",
  TV: "TV",
  PRINT: "Print",
  RADIO: "Radio",
  CINEMA: "Cinema",
  SMS: "SMS",
};

export async function parseMediaPlanFilesAction(formData: FormData): Promise<ParsedMediaPlan[]> {
  await requireMediaUser("settings");

  const files = formData.getAll("files") as File[];
  const results: ParsedMediaPlan[] = [];

  for (const file of files) {
    if (!file || file.size === 0) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      results.push(parseMediaPlanExcel(buffer, file.name));
    } catch {
      results.push({
        sourceFile: file.name,
        clientRaw: null,
        campaignName: null,
        planCode: null,
        campaignStart: null,
        campaignEnd: null,
        currency: "QAR",
        currencyLowConfidence: true,
        channel: "DIGITAL",
        channelLowConfidence: true,
        platformRows: [],
        netToMedia: null,
        netToClient: null,
        agencyFeeAmount: null,
        irAmount: null,
        warnings: [`Could not read this file as an Excel workbook — it may be corrupted or in an unsupported format.`],
      });
    }
  }

  return results;
}

// A real per-platform line item, when the file had a per-platform table to
// read (otherwise the plan stays one blended line, same as before this
// feature). buyingEntityId is the real supplier/"seat" that executed the
// buy when different from the platform itself (e.g. Meta run through an
// agency's seat) — null means bought direct. Internal tracking only, never
// shown in a client-facing export.
export type MediaPlanImportPlatformRow = {
  platform: string;
  netToMedia: number;
  agencyFeeAmount: number | null;
  irAmount: number | null;
  netToClient: number;
  buyingEntityId: string | null;
};

export type MediaPlanImportRow = {
  sourceFile: string;
  clientId: string | null; // an existing Client id
  newClientName: string | null; // set only when the user chose "create new"
  campaignName: string;
  planCode: string;
  campaignStart: string; // yyyy-mm-dd
  campaignEnd: string; // yyyy-mm-dd
  currency: string; // QAR or USD — selected/confirmed in review, never assumed
  channel: MediaChannel; // which media channel this plan is for — selected/confirmed in review, never assumed digital
  netToClient: number; // required — the real total billed to the client
  netToMedia: number | null; // real cost paid to the media owner, when known
  agencyFeeAmount: number | null; // real client-facing management fee, when known
  irAmount: number | null; // real incentive rebate from the supplier, when known
  platformRows: MediaPlanImportPlatformRow[]; // empty when the file had no per-platform table
};

export type CommitResult = { created: number; skipped: Array<{ sourceFile: string; reason: string }> };

// Ended campaigns with no per-platform breakdown are logged as one summary
// line item, tied to a shared generic asset for that channel so the real
// total still counts toward Dashboard/Reports spend totals, correctly
// attributed to the real channel instead of always Digital. The original
// "DIGITAL-IMPORT-SUMMARY"/"Historical Digital Import" pair is preserved
// exactly (same code/name) so existing real imports are untouched; this
// only creates the equivalent pair for other channels, lazily, the first
// time one is actually used.
async function getOrCreateGenericChannelAsset(channel: MediaChannel) {
  const label = CHANNEL_LABEL[channel];
  const assetCode = channel === "DIGITAL" ? GENERIC_DIGITAL_ASSET_CODE : `${channel}-IMPORT-SUMMARY`;
  const supplierName = channel === "DIGITAL" ? GENERIC_DIGITAL_SUPPLIER_NAME : `Historical ${label} Import`;

  const existing = await prisma.asset.findUnique({ where: { assetCode } });
  if (existing) return existing;

  const [supplier, category] = await Promise.all([
    prisma.supplier.upsert({
      where: { name: supplierName },
      update: {},
      create: { name: supplierName, mediaChannel: channel },
    }),
    prisma.assetCategory.findFirst({ where: { name: "Other" } }),
  ]);
  if (!category) throw new Error(`No "Other" asset category found — cannot create the generic ${label} import asset.`);

  return prisma.asset.create({
    data: {
      assetCode,
      supplierId: supplier.id,
      assetName: `${label} Campaign Summary (Historical Import)`,
      mediaCategoryId: category.id,
      locationName: `N/A (bulk-imported historical ${label.toLowerCase()} campaign)`,
    },
  });
}

function platformSlug(platform: string): string {
  return platform
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

// Per-platform line items reuse a REAL existing Supplier when the platform
// already has one (e.g. "Meta" — which already has real CPM/CPC assets, the
// same ones the manual New Media Plan flow uses), so historical spend
// attributes to the real, AVR-eligible entity rather than a generic bucket.
// A platform with no real Supplier yet (e.g. "Inmobi") gets bootstrapped as
// a real Supplier immediately — not another generic wrapper — so future
// real rate cards/assets for it have somewhere real to live; only the
// placeholder Asset underneath is marked "(Historical Import)".
async function getOrCreatePlatformAsset(channel: MediaChannel, platformName: string) {
  const realSupplier = await prisma.supplier.findFirst({
    where: { name: { equals: platformName, mode: "insensitive" }, isActive: true },
    include: { assets: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (realSupplier && realSupplier.assets.length > 0) return realSupplier.assets[0];

  const assetCode = `${platformSlug(platformName)}-${channel}-IMPORT-SUMMARY`;
  const existingAsset = await prisma.asset.findUnique({ where: { assetCode } });
  if (existingAsset) return existingAsset;

  const [supplier, category] = await Promise.all([
    prisma.supplier.upsert({
      where: { name: platformName },
      update: {},
      create: { name: platformName, mediaChannel: channel },
    }),
    prisma.assetCategory.findFirst({ where: { name: "Other" } }),
  ]);
  if (!category) throw new Error(`No "Other" asset category found — cannot create the ${platformName} import asset.`);

  return prisma.asset.create({
    data: {
      assetCode,
      supplierId: supplier.id,
      assetName: `${platformName} Campaign Summary (Historical Import)`,
      mediaCategoryId: category.id,
      locationName: `N/A (bulk-imported historical ${platformName} campaign)`,
    },
  });
}

export async function commitMediaPlanImportAction(rows: MediaPlanImportRow[]): Promise<CommitResult> {
  const user = await requireMediaUser("settings");

  const skipped: Array<{ sourceFile: string; reason: string }> = [];
  let created = 0;

  for (const row of rows) {
    if (!row.campaignName || !row.planCode || !row.campaignStart || !row.campaignEnd || !row.netToClient) {
      skipped.push({ sourceFile: row.sourceFile, reason: "Missing a required field." });
      continue;
    }
    if (!row.clientId && !row.newClientName) {
      skipped.push({ sourceFile: row.sourceFile, reason: "No client selected." });
      continue;
    }

    const existingPlan = await prisma.mediaPlan.findUnique({ where: { planCode: row.planCode } });
    if (existingPlan) {
      skipped.push({ sourceFile: row.sourceFile, reason: `Plan code "${row.planCode}" already exists — skipped, not overwritten.` });
      continue;
    }

    const campaignStart = new Date(row.campaignStart);
    const campaignEnd = new Date(row.campaignEnd);
    if (campaignEnd < campaignStart) {
      skipped.push({ sourceFile: row.sourceFile, reason: "Campaign End is before Campaign Start." });
      continue;
    }

    const client = row.clientId
      ? await prisma.client.findUnique({ where: { id: row.clientId } })
      : ((await prisma.client.findUnique({ where: { name: row.newClientName! } })) ?? (await prisma.client.create({ data: { name: row.newClientName!, departments: ["media"] } })));
    if (!client) {
      skipped.push({ sourceFile: row.sourceFile, reason: "Selected client no longer exists." });
      continue;
    }
    if (!client.departments.includes("media")) {
      skipped.push({ sourceFile: row.sourceFile, reason: `${client.name} is not handled by Media.` });
      continue;
    }

    const itemsData: Prisma.MediaPlanItemCreateWithoutMediaPlanVersionInput[] = [];

    if (row.platformRows.length > 0) {
      for (const platformRow of row.platformRows) {
        const asset = await getOrCreatePlatformAsset(row.channel, platformRow.platform);
        itemsData.push({
          asset: { connect: { id: asset.id } },
          startDate: campaignStart,
          endDate: campaignEnd,
          selectedCircuits: 1,
          rateSnapshot: {
            note: `Bulk-imported real per-platform total from "${row.sourceFile}".`,
            capturedAt: new Date().toISOString(),
          },
          grossCost: platformRow.netToMedia,
          netMedia: platformRow.netToMedia,
          agencyFeeAmount: platformRow.agencyFeeAmount,
          irAmount: platformRow.irAmount,
          lineTotal: platformRow.netToClient,
          notes: `Imported from ${row.sourceFile}`,
          ...(platformRow.buyingEntityId ? { buyingEntity: { connect: { id: platformRow.buyingEntityId } } } : {}),
        });
      }
    } else {
      const netMedia = row.netToMedia ?? row.netToClient;
      const genericAsset = await getOrCreateGenericChannelAsset(row.channel);
      itemsData.push({
        asset: { connect: { id: genericAsset.id } },
        startDate: campaignStart,
        endDate: campaignEnd,
        selectedCircuits: 1,
        rateSnapshot: {
          note: `Bulk-imported historical total from "${row.sourceFile}" — not a per-platform breakdown.`,
          capturedAt: new Date().toISOString(),
        },
        grossCost: netMedia,
        netMedia,
        agencyFeeAmount: row.agencyFeeAmount,
        irAmount: row.irAmount,
        lineTotal: row.netToClient,
        notes: `Imported from ${row.sourceFile}`,
      });
    }

    const plan = await prisma.mediaPlan.create({
      data: {
        planCode: row.planCode,
        clientId: client.id,
        campaignName: row.campaignName,
        campaignStart,
        campaignEnd,
        currency: row.currency,
        status: "COMPLETED",
        createdById: user.id,
        versions: {
          create: {
            versionNumber: 1,
            label: "V1",
            isLocked: true,
            createdById: user.id,
            items: { create: itemsData },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "MEDIA_PLAN_IMPORTED",
        entityType: "MediaPlan",
        entityId: plan.id,
        newValue: {
          sourceFile: row.sourceFile,
          campaignName: row.campaignName,
          planCode: row.planCode,
          currency: row.currency,
          channel: row.channel,
          netToMedia: row.netToMedia,
          netToClient: row.netToClient,
          agencyFeeAmount: row.agencyFeeAmount,
          irAmount: row.irAmount,
          platformRows: row.platformRows.length > 0 ? row.platformRows : undefined,
        },
      },
    });

    created += 1;
  }

  return { created, skipped };
}
