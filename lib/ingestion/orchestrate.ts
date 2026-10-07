import "server-only";
import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { parsePdfRateCard } from "./parsePdf";
import { parseXlsxRateCard } from "./parseXlsx";
import { parseCsvRateCard } from "./parseCsv";
import { findAssetMatches, MATCH_CONFIDENT_THRESHOLD, MATCH_AMBIGUOUS_GAP } from "./matching";
import { classifyMoneyStatus, parseDurationLabel } from "./normalize";
import type { ParsedCandidate, ParseResult } from "./types";

export interface UploadRateCardInput {
  fileBuffer: Buffer;
  originalFilename: string;
  fileType: "PDF" | "XLSX" | "XLS" | "CSV";
  supplierId: string;
  rateCardTitle: string;
  rateYear: number;
  versionLabel: string;
  effectiveFrom: Date;
  uploadedById?: string;
}

export type UploadRateCardResult =
  | { status: "duplicate"; existingVersionId: string; uploadedAt: Date }
  | { status: "processed"; rateCardVersionId: string; candidateCount: number; warnings: string[] };

function runParser(fileType: UploadRateCardInput["fileType"], buffer: Buffer): Promise<ParseResult> | ParseResult {
  switch (fileType) {
    case "PDF":
      return parsePdfRateCard(buffer);
    case "XLSX":
    case "XLS":
      return parseXlsxRateCard(buffer);
    case "CSV":
      return parseCsvRateCard(buffer);
  }
}

export async function uploadAndProcessRateCard(input: UploadRateCardInput): Promise<UploadRateCardResult> {
  const checksum = createHash("sha256").update(input.fileBuffer).digest("hex");

  const existing = await prisma.rateCardVersion.findUnique({ where: { checksumSha256: checksum } });
  if (existing) {
    return { status: "duplicate", existingVersionId: existing.id, uploadedAt: existing.createdAt };
  }

  // Rate cards are internal commercial documents — the store is
  // provisioned as private, so blob.url is not a directly browsable link;
  // fetching it back later requires an authenticated @vercel/blob `get()`
  // call. A "View Source" UI that streams this through the app is a
  // Phase 2 follow-up (see docs/ingestion-notes.md).
  const blob = await put(`rate-cards/${Date.now()}-${input.originalFilename}`, input.fileBuffer, {
    access: "private",
    addRandomSuffix: true,
  });

  const rateCard = await prisma.rateCard.create({
    data: { supplierId: input.supplierId, title: input.rateCardTitle },
  });

  const rateCardVersion = await prisma.rateCardVersion.create({
    data: {
      rateCardId: rateCard.id,
      versionLabel: input.versionLabel,
      rateYear: input.rateYear,
      effectiveFrom: input.effectiveFrom,
      fileType: input.fileType,
      originalFilename: input.originalFilename,
      storageUrl: blob.url,
      checksumSha256: checksum,
      fileSizeBytes: input.fileBuffer.byteLength,
      status: "PARSING",
      uploadedById: input.uploadedById,
    },
  });

  const importJob = await prisma.importJob.create({
    data: {
      sourceType: "RATE_CARD_UPLOAD",
      status: "RUNNING",
      startedAt: new Date(),
      rateCardVersionId: rateCardVersion.id,
      triggeredById: input.uploadedById,
    },
  });

  let parseResult: ParseResult;
  try {
    parseResult = await runParser(input.fileType, input.fileBuffer);
  } catch (err) {
    await prisma.rateCardVersion.update({
      where: { id: rateCardVersion.id },
      data: { status: "FAILED" },
    });
    await prisma.importJob.update({
      where: { id: importJob.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: String(err) },
    });
    throw err;
  }

  const existingAssets = await prisma.asset.findMany({
    where: { supplierId: input.supplierId },
    select: { id: true, assetName: true, locationName: true, area: true },
  });

  // Pull the asset's most recent published rate (any source) for
  // change-detection, plus specifically its Excel-migration rate (if any)
  // for the mandatory Excel-vs-rate-card reconciliation report.
  const existingRates = await prisma.assetRate.findMany({
    where: { assetId: { in: existingAssets.map((a) => a.id) }, publishedStatus: "PUBLISHED" },
    include: { rateCardVersion: { include: { rateCard: { include: { supplier: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  let newCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let conflictCount = 0;
  let lowConfidenceCount = 0;
  const reconciliationRows: Array<Parameters<typeof prisma.reconciliation.create>[0]["data"]> = [];
  const rateChangeRows: Array<Parameters<typeof prisma.rateChange.create>[0]["data"]> = [];

  for (const candidate of parseResult.candidates) {
    const matches = findAssetMatches(candidate.candidateAssetName, candidate.candidateLocation, existingAssets);
    const top = matches[0];
    const second = matches[1];

    const isAmbiguous =
      top && second && top.score - second.score < MATCH_AMBIGUOUS_GAP && top.score < 0.9;
    const isConfidentMatch = top && top.score >= MATCH_CONFIDENT_THRESHOLD && !isAmbiguous;

    const primaryRate = candidate.rates[0];
    const newGrossStatus = classifyMoneyStatus(primaryRate?.grossRateRaw ?? null);
    const newGrossValue = primaryRate?.grossRate ?? null;

    if (candidate.confidence === "LOW") {
      lowConfidenceCount++;
      rateChangeRows.push(buildRateChangeRow(importJob.id, rateCardVersion.id, candidate, null, "LOW_CONFIDENCE", candidate.confidence, null, {
        grossRate: newGrossValue,
        grossRateStatus: newGrossStatus,
      }));
      continue;
    }

    if (!top || !isConfidentMatch) {
      if (isAmbiguous) {
        conflictCount++;
        rateChangeRows.push(
          buildRateChangeRow(importJob.id, rateCardVersion.id, candidate, null, "CONFLICT", candidate.confidence, null, {
            grossRate: newGrossValue,
            grossRateStatus: newGrossStatus,
            possibleMatches: matches.slice(0, 3).map((m) => ({ assetId: m.asset.id, name: m.asset.assetName, score: m.score })),
          })
        );
      } else {
        newCount++;
        rateChangeRows.push(
          buildRateChangeRow(importJob.id, rateCardVersion.id, candidate, null, "NEW", candidate.confidence, null, {
            grossRate: newGrossValue,
            grossRateStatus: newGrossStatus,
          })
        );
      }
      continue;
    }

    const matchedAsset = top.asset;
    const existingRate = existingRates.find((r) => r.assetId === matchedAsset.id);
    const oldValue = existingRate
      ? { grossRate: existingRate.grossRate ? Number(existingRate.grossRate) : null, grossRateStatus: existingRate.grossRateStatus, rateYear: existingRate.rateYear }
      : null;

    const changed =
      !existingRate ||
      existingRate.grossRateStatus !== newGrossStatus ||
      (existingRate.grossRate !== null && Number(existingRate.grossRate) !== newGrossValue);

    if (!changed) {
      unchangedCount++;
    } else {
      changedCount++;
    }

    rateChangeRows.push(
      buildRateChangeRow(
        importJob.id,
        rateCardVersion.id,
        candidate,
        matchedAsset.id,
        changed ? "CHANGED" : "UNCHANGED",
        candidate.confidence,
        oldValue,
        { grossRate: newGrossValue, grossRateStatus: newGrossStatus }
      )
    );

    // Mandatory reconciliation: if the existing rate this candidate would
    // change came from the Excel migration snapshot, never silently
    // overwrite it — always surface a Reconciliation row for Admin approval.
    if (existingRate && changed && existingRate.rateCardVersion.rateCard.supplier.name === "__EXCEL_MIGRATION__") {
      reconciliationRows.push({
        assetId: matchedAsset.id,
        candidateAssetName: candidate.candidateAssetName,
        fieldName: "grossRate",
        excelValue: existingRate.grossRate !== null ? String(existingRate.grossRate) : existingRate.grossRateStatus,
        rateCardValue: newGrossValue !== null ? String(newGrossValue) : newGrossStatus,
        difference:
          existingRate.grossRate !== null && newGrossValue !== null
            ? String(newGrossValue - Number(existingRate.grossRate))
            : null,
        sourceDocument: input.originalFilename,
        sourcePage: candidate.sourcePage,
        rateCardVersionId: rateCardVersion.id,
        recommendedAction: "NEEDS_DISCUSSION",
      });
    }
  }

  await prisma.$transaction([
    ...rateChangeRows.map((data) => prisma.rateChange.create({ data })),
    ...reconciliationRows.map((data) => prisma.reconciliation.create({ data })),
    prisma.rateCardVersion.update({
      where: { id: rateCardVersion.id },
      data: {
        status: "REVIEW",
        assetsExtracted: parseResult.candidates.length,
        warningsCount: parseResult.warnings.length + lowConfidenceCount + conflictCount,
      },
    }),
    prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        assetsFound: parseResult.candidates.length,
        conflictsFound: conflictCount,
        summary: {
          new: newCount,
          changed: changedCount,
          unchanged: unchangedCount,
          conflict: conflictCount,
          lowConfidence: lowConfidenceCount,
          parserWarnings: parseResult.warnings,
        },
      },
    }),
  ]);

  return {
    status: "processed",
    rateCardVersionId: rateCardVersion.id,
    candidateCount: parseResult.candidates.length,
    warnings: parseResult.warnings,
  };
}

function buildRateChangeRow(
  importJobId: string,
  rateCardVersionId: string,
  candidate: ParsedCandidate,
  assetId: string | null,
  changeType: "NEW" | "CHANGED" | "UNCHANGED" | "CONFLICT" | "LOW_CONFIDENCE",
  confidence: ParsedCandidate["confidence"],
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown>
) {
  const duration = parseDurationLabel(candidate.rates[0]?.durationLabel ?? null);
  return {
    importJobId,
    rateCardVersionId,
    assetId: assetId ?? undefined,
    candidateAssetName: candidate.candidateAssetName,
    candidateLocation: candidate.candidateLocation,
    changeType,
    extractionConfidence: confidence,
    oldValue: (oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
    newValue: {
      ...newValue,
      durationLabel: candidate.rates[0]?.durationLabel ?? null,
      durationValue: duration?.value ?? null,
      durationUnit: duration?.unit ?? null,
      fees: candidate.rates[0]?.fees ?? [],
      sizeRaw: candidate.sizeRaw,
      facesOrScreens: candidate.facesOrScreens,
      quantityLabel: candidate.quantityLabel,
      sourcePage: candidate.sourcePage,
      sourceSnippet: candidate.sourceSnippet,
      confidenceReason: candidate.confidenceReason,
      unclassifiedAmounts: candidate.unclassifiedAmounts,
    } as unknown as Prisma.InputJsonValue,
  };
}
