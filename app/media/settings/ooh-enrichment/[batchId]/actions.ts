"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { put } from "@vercel/blob";
import type { OohEnrichmentRow } from "@/lib/ingestion/oohEnrichmentRow";
import { enrichmentRowKey } from "@/lib/ingestion/oohEnrichmentRow";

const DURATION_MAP: Record<string, { basis: string; value: string; unit: string; label: string }> = {
  "1_day": { basis: "PER_DAY", value: "1", unit: "days", label: "per day" },
  "1_week": { basis: "PER_WEEK", value: "1", unit: "weeks", label: "per week" },
  "2_week": { basis: "PER_2_WEEKS", value: "2", unit: "weeks", label: "per 2 weeks" },
  "1_month": { basis: "PER_4_WEEKS", value: "1", unit: "months", label: "per month" },
  "3_month": { basis: "PER_3_MONTHS", value: "3", unit: "months", label: "per 3 months" },
  "6_month": { basis: "PER_6_MONTHS", value: "6", unit: "months", label: "per 6 months" },
  "12_month": { basis: "PER_12_MONTHS", value: "12", unit: "months", label: "per 12 months" },
};

function slug(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 40);
}

function indoorOutdoor(format: string | null): "INDOOR" | "OUTDOOR" {
  if (!format) return "OUTDOOR";
  const f = format.toLowerCase();
  return f.includes("indoor") || f.includes("elevator") ? "INDOOR" : "OUTDOOR";
}

function getPending(batchPending: unknown, resolved: string[]): OohEnrichmentRow[] {
  const all = (batchPending as OohEnrichmentRow[]) ?? [];
  return all.filter((r) => !resolved.includes(enrichmentRowKey(r)));
}

async function findRow(batchId: string, rowKey: string) {
  const batch = await prisma.oohEnrichmentBatch.findUniqueOrThrow({ where: { id: batchId } });
  const pending = getPending(batch.pending, batch.resolved);
  const row = pending.find((r) => enrichmentRowKey(r) === rowKey);
  return { batch, row };
}

// Mirrors the KMZ review flow: the first real point for an asset lands
// directly on Asset.latitude/longitude; a later point migrates the original
// into AssetLocation alongside the new one, so nothing is overwritten.
async function assignLocation(assetId: string, lat: number, lon: number, label: string) {
  const asset = await prisma.asset.findUniqueOrThrow({
    where: { id: assetId },
    include: { _count: { select: { locations: true } }, locations: { select: { label: true } } },
  });
  if (asset.locations.some((l) => l.label === label)) return;
  if (asset.latitude === null && asset._count.locations === 0) {
    await prisma.asset.update({ where: { id: assetId }, data: { latitude: lat, longitude: lon } });
    return;
  }
  if (asset.latitude !== null && asset._count.locations === 0) {
    await prisma.assetLocation.create({
      data: { assetId, label: asset.assetName, latitude: asset.latitude, longitude: asset.longitude! },
    });
  }
  await prisma.assetLocation.create({ data: { assetId, label, latitude: lat, longitude: lon } });
}

// Some suppliers' figures came through as descriptive text instead of a
// clean number (e.g. "20,000+ daily riders on weekdays (supplier-stated)").
// AudienceMetric.value is a strict Decimal column, so this extracts the real
// leading number and keeps the qualifying text in `unit` instead of losing
// it — rather than crashing the whole row resolution, which is what
// happened in production for rows like this.
function parseAudienceValue(raw: number | string | null): { value: number; note: string | null } | null {
  if (raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? { value: raw, note: null } : null;
  const match = raw.match(/[\d,]+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const remainder = raw.replace(match[0], "").replace(/^[+\-–—\s]+/, "").trim();
  return { value, note: remainder || null };
}

async function applyAudience(assetId: string, row: OohEnrichmentRow, sourceLabel: string) {
  const citation = `${sourceLabel} — row for "${row.assetName}"`;

  const footfall = parseAudienceValue(row.footfall);
  if (footfall) {
    await prisma.audienceMetric.create({
      data: {
        assetId,
        metricType: "daily_footfall",
        value: footfall.value,
        unit: footfall.note ? `visitors (${footfall.note})` : "visitors",
        sourceDocument: citation,
        rateYear: 2026,
      },
    });
  }

  const impressions = parseAudienceValue(row.impressions);
  if (impressions) {
    const metricType = row.impressionPeriod ? `impressions_${row.impressionPeriod.toLowerCase().replace(/\s+/g, "_")}` : "impressions";
    await prisma.audienceMetric.create({
      data: {
        assetId,
        metricType,
        value: impressions.value,
        unit: impressions.note ? `impressions (${impressions.note})` : "impressions",
        sourceDocument: citation,
        rateYear: 2026,
      },
    });
  }

  const ots = parseAudienceValue(row.ots);
  if (ots) {
    await prisma.audienceMetric.create({
      data: {
        assetId,
        metricType: "ots",
        value: ots.value,
        unit: ots.note ? `opportunities to see (${ots.note})` : "opportunities to see",
        sourceDocument: citation,
        rateYear: 2026,
      },
    });
  }
}

export async function assignToExistingAction(formData: FormData) {
  const user = await requireMediaUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Only Admins can resolve enrichment rows.");

  const batchId = formData.get("batchId") as string;
  const rowKey = formData.get("rowKey") as string;
  const assetId = formData.get("assetId") as string;
  if (!assetId) return;

  const { batch, row } = await findRow(batchId, rowKey);
  if (!row) return;

  if (row.lat !== null && row.lon !== null) {
    await assignLocation(assetId, row.lat, row.lon, row.assetName);
  }
  await applyAudience(assetId, row, batch.sourceLabel);

  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { assetName: true } });
  await prisma.oohEnrichmentBatch.update({ where: { id: batchId }, data: { resolved: { push: rowKey } } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "OOH_ENRICHMENT_ASSIGNED",
      entityType: "Asset",
      entityId: assetId,
      newValue: { rowAssetName: row.assetName, assetName: asset.assetName, lat: row.lat, lon: row.lon },
    },
  });

  revalidatePath(`/media/settings/ooh-enrichment/${batchId}`);
}

export async function createNewAssetAction(formData: FormData) {
  const user = await requireMediaUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Only Admins can resolve enrichment rows.");

  const batchId = formData.get("batchId") as string;
  const rowKey = formData.get("rowKey") as string;

  const { batch, row } = await findRow(batchId, rowKey);
  if (!row) return;

  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { name: row.dbSupplier } });
  const otherCategory = await prisma.assetCategory.findUniqueOrThrow({ where: { name: "Other" } });
  const roadsideCategory = await prisma.assetCategory.findUnique({ where: { name: "Roadside" } });
  const transitCategory = await prisma.assetCategory.findUnique({ where: { name: "Transit" } });
  const category =
    row.environment === "Roadside" || row.environment === "Highway"
      ? roadsideCategory ?? otherCategory
      : row.environment === "Commuter"
        ? transitCategory ?? otherCategory
        : otherCategory;

  const asset = await prisma.asset.create({
    data: {
      assetCode: `OOH-${slug(row.dbSupplier)}-${slug(row.assetName)}-${row.row}`,
      supplierId: supplier.id,
      assetName: row.assetName,
      mediaCategoryId: category.id,
      mediaType: row.format,
      format: row.staticDigital === "Digital" ? "DIGITAL" : "STATIC",
      indoorOutdoor: indoorOutdoor(row.format),
      locationName: row.location ?? row.dbSupplier,
      area: row.area,
      municipality: row.municipality,
      numberOfFaces: typeof row.numFaces === "number" ? row.numFaces : null,
      notes: [row.assetDescription, row.notes].filter(Boolean).join(" — ") || null,
      pricingCalculationMethod: "PRO_RATA",
      latitude: row.lat,
      longitude: row.lon,
      extraAttributes: { sourceDimensions: row.dimensions, sourceAreaSqm: row.areaSqm, sourceRow: row.row },
    },
  });

  const priceEntries = Object.entries(row.prices ?? {});
  if (priceEntries.length > 0) {
    const csvContent = `"Source: ${batch.sourceLabel}"\n"Asset Name","Environment","Format","Sub-format","Prices","Original Supplier Description"\n"${row.assetName}","${row.environment ?? ""}","${row.format ?? ""}","${row.subFormat ?? ""}","${JSON.stringify(row.prices)}","${(row.origSupplierDesc ?? "").replace(/"/g, '""')}"\n`;
    const csvBuffer = Buffer.from(csvContent, "utf-8");
    const checksum = createHash("sha256").update(csvBuffer).digest("hex");
    const blob = await put(`rate-cards/ooh-enrichment-${slug(row.dbSupplier).toLowerCase()}-${row.row}-${Date.now()}.csv`, csvBuffer, {
      access: "private",
      addRandomSuffix: true,
      contentType: "text/csv",
    });
    const rateCard = await prisma.rateCard.create({
      data: { supplierId: supplier.id, title: `${row.assetName} (from master OOH database)` },
    });
    const rateCardVersion = await prisma.rateCardVersion.create({
      data: {
        rateCardId: rateCard.id,
        versionLabel: "V1",
        rateYear: 2026,
        effectiveFrom: new Date("2026-01-01"),
        fileType: "CSV",
        originalFilename: `${row.assetName} — extract from ${batch.sourceLabel}`,
        storageUrl: blob.url,
        checksumSha256: checksum,
        fileSizeBytes: csvBuffer.length,
        status: "PUBLISHED",
        uploadedById: user.id,
        publishedAt: new Date(),
        assetsExtracted: 1,
      },
    });

    for (const [key, price] of priceEntries) {
      const d = DURATION_MAP[key];
      if (!d) continue;
      await prisma.assetRate.create({
        data: {
          assetId: asset.id,
          supplierId: supplier.id,
          rateCardVersionId: rateCardVersion.id,
          rateYear: 2026,
          currency: "QAR",
          effectiveFrom: new Date("2026-01-01"),
          pricingBasis: d.basis as never,
          durationValue: d.value,
          durationUnit: d.unit,
          quantityBasis: d.label,
          grossRateStatus: "KNOWN",
          grossRate: price,
          publishedStatus: "PUBLISHED",
          sourceValueRaw: `QAR ${price.toLocaleString()} (${key.replace("_", " ")})`,
        },
      });
    }
  }

  await applyAudience(asset.id, row, batch.sourceLabel);

  await prisma.oohEnrichmentBatch.update({ where: { id: batchId }, data: { resolved: { push: rowKey } } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "OOH_ENRICHMENT_NEW_ASSET",
      entityType: "Asset",
      entityId: asset.id,
      newValue: { rowAssetName: row.assetName, supplier: row.dbSupplier },
    },
  });

  revalidatePath(`/media/settings/ooh-enrichment/${batchId}`);
}

export async function dismissRowAction(formData: FormData) {
  const user = await requireMediaUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Only Admins can resolve enrichment rows.");

  const batchId = formData.get("batchId") as string;
  const rowKey = formData.get("rowKey") as string;

  await prisma.oohEnrichmentBatch.update({ where: { id: batchId }, data: { resolved: { push: rowKey } } });
  revalidatePath(`/media/settings/ooh-enrichment/${batchId}`);
}
