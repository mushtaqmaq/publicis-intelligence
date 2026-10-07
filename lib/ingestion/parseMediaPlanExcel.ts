import * as XLSX from "xlsx";
import type { MediaChannel } from "@/generated/prisma/enums";

export interface ParsedMediaPlan {
  sourceFile: string;
  clientRaw: string | null;
  campaignName: string | null;
  planCode: string | null;
  campaignStart: string | null; // ISO date (yyyy-mm-dd) or null — never guessed
  campaignEnd: string | null;
  currency: "QAR" | "USD"; // the currency every figure below is actually denominated in
  currencyLowConfidence: boolean; // true when no QAR column exists at all and USD was assumed
  channel: MediaChannel; // which media channel this plan is actually for — detected, never assumed digital by default
  channelLowConfidence: boolean; // true when the real channel couldn't be confirmed and needs a human pick
  // Real per-platform rows from the file's own platform table (Inmobi,
  // Google UAC, Meta, TikTok, …), each with its own real QAR total and the
  // file's own stated Budget Allocation % — populated only for templates
  // that have a per-platform table (empty for Summary-only templates like
  // QNB's, which have no such breakdown to read). grossMedia is the raw
  // per-platform total before any IR rebate is subtracted (summing every
  // row's grossMedia equals the top-level netToMedia + irAmount).
  platformRows: { platform: string; grossMedia: number; budgetAllocationPct: number | null }[];
  netToMedia: number | null; // real cost paid to the media owner/platform, after IR (the actual spendable amount)
  netToClient: number | null; // real grand total billed to the client
  agencyFeeAmount: number | null; // real client-facing management/campaign fee, when the file has one
  irAmount: number | null; // real incentive rebate earned from the supplier, when the file has one
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function normalizeLabel(v: unknown): string {
  return typeof v === "string" ? v.toUpperCase().replace(/[^A-Z]/g, "") : "";
}

// Real Excel files sometimes store a "date" as a serial number with tiny
// fractional drift (e.g. 20:59:52 instead of 00:00:00) from being copied or
// computed — truncating naively can land on the wrong calendar day.
// Rounding to the nearest day first recovers the intended date.
function isoDate(d: Date): string {
  const rounded = new Date(d.getTime() + 12 * 60 * 60 * 1000);
  return rounded.toISOString().slice(0, 10);
}

// Real files use a free-text "Duration" cell like "1-31 Jan\n2026" instead of
// real Start/End Date fields. Parsed only when it unambiguously matches this
// shape — anything else (e.g. "Per Campaign", a bare day-count) is left null
// rather than guessed.
function parseDurationRange(value: unknown): { start: string; end: string } | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  const match = text.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (!match) return null;
  const [, dayStart, dayEnd, monthName, yearStr] = match;
  const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const year = Number(yearStr);
  const start = new Date(Date.UTC(year, month, Number(dayStart)));
  const end = new Date(Date.UTC(year, month, Number(dayEnd)));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start: isoDate(start), end: isoDate(end) };
}

function findClientFromTitle(rows: unknown[][]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      const match = cell.match(/CLIENT\s*:\s*([^\n\r]+)/i);
      if (match) return match[1].trim();
    }
  }
  return null;
}

// Real channel detection, built from 12 real files (5 digital, 1 TV, 1
// print, plus stale/unrelated tabs that must NOT be picked up — see
// docs referenced in the import-media-plans plan). Operates only on the
// single sheet already selected (Summary, or the first sheet) — this
// deliberately never scans other tabs in the workbook, since two real
// files were found to carry a leftover, unrelated campaign's data on a
// second tab.
function detectChannel(
  sheetName: string,
  rows: unknown[][],
  otherSheetsText: string[]
): { channel: MediaChannel; lowConfidence: boolean } {
  const sheetNameLower = sheetName.toLowerCase();
  const isTvSheet = /video|linear/i.test(sheetNameLower);
  const hasTvContent = rows.some((row) =>
    row.some((c) => typeof c === "string" && (/^total tv$/i.test(c.trim()) || /TV RGRPs?/i.test(c)))
  );
  if (isTvSheet || hasTvContent) return { channel: "TV", lowConfidence: false };

  let titleIsDigital = false;
  let titleIsOffline = false;
  let summaryDigital = false;
  let summaryOffline = false;
  for (const row of rows) {
    const firstCellLabel = typeof row[0] === "string" ? row[0].trim().toLowerCase() : "";
    if (firstCellLabel === "digital") summaryDigital = true;
    if (firstCellLabel === "offline media" || firstCellLabel === "offline") summaryOffline = true;
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      if (/DIGITAL MEDIA PLAN/i.test(cell)) titleIsDigital = true;
      if (/OFFLINE MEDIA PLAN/i.test(cell)) titleIsOffline = true;
    }
  }

  if (titleIsDigital || summaryDigital) return { channel: "DIGITAL", lowConfidence: false };

  if (titleIsOffline || summaryOffline) {
    // The real sub-type signal (e.g. a "NEWSPAPERS" line-item header) often
    // lives on a different tab than the Summary sheet actually read above
    // (e.g. QNB's "MP" tab) — safe to peek at other tabs for this narrow
    // categorization check only, since a wrong guess here only affects
    // which generic non-digital bucket the plan is grouped under, never the
    // real totals/dates/campaign identity (those are still only ever read
    // from the one sheet selected above).
    const hasNewspaperHeader =
      rows.some((row) => row.some((c) => typeof c === "string" && /NEWSPAPER/i.test(c))) ||
      otherSheetsText.some((t) => /NEWSPAPER/i.test(t));
    if (hasNewspaperHeader) return { channel: "PRINT", lowConfidence: false };
    // A real "offline" signal with no more specific sub-type detected —
    // never guessed silently; the review UI requires a human pick.
    return { channel: "OOH", lowConfidence: true };
  }

  // No explicit signal at all — matches every one of the originally
  // supported real files (McDonald's/Commercial Bank templates), so the
  // default stays DIGITAL to keep their behavior unchanged.
  return { channel: "DIGITAL", lowConfidence: false };
}

function firstNonEmpty(row: unknown[]): unknown {
  return row.find((v) => v !== null && v !== undefined && v !== "");
}

// Some templates (e.g. Nestlé's TV plan) store a label's value with a
// leading ": " baked into the cell itself (e.g. ": Nestle") rather than in a
// separate cell — strip it so it doesn't end up in the real value. A no-op
// for every template that doesn't have this artifact.
function stripLeadingColon(v: string): string {
  return v.replace(/^:\s*/, "").trim();
}

// Reads the value in `col` from `row`, preferring it only when it's a
// number — used for the QAR-column reads below where the USD twin sits in
// an adjacent column of the same row.
function numberAt(row: unknown[] | undefined, col: number): number | null {
  const v = row?.[col];
  return typeof v === "number" ? v : null;
}

export function parseMediaPlanExcel(buffer: Buffer, sourceFile: string): ParsedMediaPlan {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const summarySheetName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === "summary");
  const sheetName = summarySheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const warnings: string[] = [];

  let clientRaw: string | null = null;
  let campaignName: string | null = null;
  let planCode: string | null = null;
  let startDateLabelValue: Date | null = null;
  let endDateLabelValue: Date | null = null;
  let durationText: string | null = null;
  let headerRowIndex: number | null = null;
  let platformColIndex: number | null = null;
  const totalRowIndices: number[] = [];
  let campaignManagementRowIndex: number | null = null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const label = normalizeLabel(row[c]);
      if (!label) continue;

      const nextValue = row.slice(c + 1).find((v) => v !== null && v !== undefined && v !== "");

      if (label === "CLIENT" && !clientRaw && typeof nextValue === "string") clientRaw = stripLeadingColon(nextValue);
      if (label === "CAMPAIGNNAME" && !campaignName && typeof nextValue === "string") campaignName = stripLeadingColon(nextValue);
      if ((label === "REF" || label === "REFERENCENUMBER") && !planCode && typeof nextValue === "string") planCode = stripLeadingColon(nextValue);
      if (label === "STARTDATE" && nextValue instanceof Date) startDateLabelValue = nextValue;
      if (label === "ENDDATE" && nextValue instanceof Date) endDateLabelValue = nextValue;
      // "Duration" is deliberately NOT handled here — it's almost always a
      // column header (see the dedicated lookup below), and treating it as a
      // same-row label:value pair here would grab the NEXT header cell
      // (e.g. "Total (USD)") as if it were the duration text.
      if (label === "PLATFORM") {
        headerRowIndex = r;
        platformColIndex = c;
      }
      if (label === "CAMPAIGNMANAGEMENT" || label === "AGENCYFEES") campaignManagementRowIndex = r;
    }

    const firstCell = firstNonEmpty(row);
    if (typeof firstCell === "string" && normalizeLabel(firstCell).startsWith("TOTAL")) {
      totalRowIndices.push(r);
    }
  }

  if (!clientRaw) clientRaw = findClientFromTitle(rows);

  // Some templates put "Duration" as a column header (e.g. "1-31 Jan\n2026"
  // per data row) rather than a standalone label:value pair — check the
  // first data row under that column if the label scan above found nothing.
  const lastTotalRowIndex = totalRowIndices.length > 0 ? totalRowIndices[totalRowIndices.length - 1] : null;
  if (!durationText && headerRowIndex !== null) {
    const headerRow = rows[headerRowIndex];
    const durationColIndex = headerRow.findIndex((h) => normalizeLabel(h) === "DURATION");
    if (durationColIndex >= 0) {
      for (let r = headerRowIndex + 1; r < (lastTotalRowIndex ?? rows.length); r++) {
        const value = rows[r]?.[durationColIndex];
        if (typeof value === "string" && value.trim()) {
          durationText = value;
          break;
        }
      }
    }
  }

  // A real reference code (e.g. "MCD2026-003") is usually embedded in the
  // campaign name even when no standalone REF/REFERENCE NUMBER field exists
  // on this sheet — reuse it rather than leaving the plan without a code.
  if (!planCode && campaignName) {
    const match = campaignName.match(/[A-Z]{2,6}\d{4}-\d{2,4}/);
    if (match) planCode = match[0];
  }

  const otherSheetsText: string[] = workbook.SheetNames.filter((n) => n !== sheetName).flatMap((n) =>
    (XLSX.utils.sheet_to_json(workbook.Sheets[n], { header: 1, defval: null }) as unknown[][]).flatMap((row) =>
      row.filter((c): c is string => typeof c === "string")
    )
  );
  const { channel, lowConfidence: channelLowConfidence } = detectChannel(sheetName, rows, otherSheetsText);

  // The QAR-denominated column in the header row (e.g. "Total (QAR)",
  // "Net Cost QAR") — every money figure below is read from this same
  // column so USD/QAR twins never get mixed up. Only meaningful for the
  // per-platform table templates (a "Summary"-style sheet has no such
  // header row at all).
  const qarColIndex = headerRowIndex !== null ? rows[headerRowIndex].findIndex((h) => typeof h === "string" && /QAR/i.test(h)) : -1;

  // Real per-platform rows (Inmobi, Google UAC, Meta, TikTok, …), each with
  // its own real QAR total and the file's own stated Budget Allocation % —
  // read straight from the per-platform table, using the exact header
  // columns already located above. Only populated for templates that have
  // this table at all (headerRowIndex !== null); Summary-only templates
  // (e.g. QNB's) have nothing here and keep today's single-blended-line
  // behavior.
  const platformRows: { platform: string; grossMedia: number; budgetAllocationPct: number | null }[] = [];
  if (headerRowIndex !== null && platformColIndex !== null) {
    const headerRow = rows[headerRowIndex];
    const budgetAllocColIndex = headerRow.findIndex((h) => typeof h === "string" && /BUDGET.*ALLOCATION/i.test(h));
    const firstTotalRowIndex = totalRowIndices.length > 0 ? totalRowIndices[0] : rows.length;
    for (let r = headerRowIndex + 1; r < firstTotalRowIndex; r++) {
      const row = rows[r];
      if (!row) continue;
      const platformName = row[platformColIndex];
      if (typeof platformName !== "string" || !platformName.trim()) continue;
      const grossMediaValue = qarColIndex >= 0 ? numberAt(row, qarColIndex) : null;
      if (grossMediaValue === null || grossMediaValue < 2) continue;
      const budgetAllocationRaw = budgetAllocColIndex >= 0 ? numberAt(row, budgetAllocColIndex) : null;
      platformRows.push({
        platform: platformName.trim(),
        grossMedia: grossMediaValue,
        budgetAllocationPct: budgetAllocationRaw,
      });
    }
  }

  // Real currency detection is a whole-sheet scan for a literal "QAR" or
  // "USD" marker, not tied to the per-platform header row — a "Summary"
  // sheet (e.g. QNB's) marks its totals as QAR via plain label cells
  // ("Total QAR"), not a table header. Currency isn't assumed to be QAR
  // just because that's the app default — a sheet with no QAR marker at
  // all (some digital-platform templates only report USD) is reported as
  // USD, flagged low-confidence so it can be corrected in review.
  const hasQarMarker = qarColIndex >= 0 || rows.some((row) => row.some((c) => typeof c === "string" && /QAR/i.test(c)));
  const hasUsdMarker = rows.some((row) => row.some((c) => typeof c === "string" && /USD/i.test(c)));
  const currency: "QAR" | "USD" = hasQarMarker ? "QAR" : "USD";
  const currencyLowConfidence = !hasQarMarker && !hasUsdMarker;

  // Real money totals across every file seen so far are always well into
  // the thousands — the only values under 2 ever found in a "Total..." row
  // are non-monetary metrics (e.g. a TV template's "Total TV" reach
  // fraction like 0.9485), so treat those as not-found rather than a real
  // total.
  function totalFromRow(rowIndex: number | null): number | null {
    if (rowIndex === null) return null;
    const row = rows[rowIndex];
    if (qarColIndex >= 0) {
      const v = numberAt(row, qarColIndex);
      if (v !== null && v >= 2) return v;
    }
    const numbers = row.filter((v): v is number => typeof v === "number" && v >= 2);
    return numbers.length > 0 ? Math.max(...numbers) : null;
  }

  // When a template has two distinct "TOTAL..." rows (e.g. "TOTAL AD SPEND"
  // then a later "TOTAL "/"TOTAL AMOUNT" after adding the management fee),
  // the first is the real media cost and the last is the real client total.
  // A template with only one such row (e.g. QNB's) gives no way to tell
  // those apart, so it's recorded as netToClient only — never guessed.
  const netToMediaGross = totalRowIndices.length >= 2 ? totalFromRow(totalRowIndices[0]) : null;
  const netToClient = totalFromRow(lastTotalRowIndex);
  const agencyFeeAmount = totalFromRow(campaignManagementRowIndex);

  // IR (incentive rebate) shows up two different ways in real files: a
  // standalone labeled row (like Campaign Management, already QAR-safe via
  // totalFromRow) giving a flat value, or a per-platform column that can
  // itself be EITHER a percentage (e.g. "IR 35%") or a flat value per row.
  // A flat-value column was found denominated in USD even though every
  // other total on the same sheet was QAR — so a plain sum is only trusted
  // when the header says QAR (or gives no currency at all), and a
  // USD-labeled value column is converted per-row using that row's own
  // real USD→QAR ratio rather than a guessed fixed rate.
  let irAmount: number | null = null;
  let irLowConfidence = false;

  const irRowIndex = (() => {
    for (let r = 0; r < rows.length; r++) {
      if (r === headerRowIndex || totalRowIndices.includes(r)) continue;
      const label = normalizeLabel(firstNonEmpty(rows[r]));
      if (label === "IR" || label === "IRAMOUNT" || label === "INCENTIVEREBATE") return r;
    }
    return null;
  })();

  if (irRowIndex !== null) {
    irAmount = totalFromRow(irRowIndex);
  } else if (headerRowIndex !== null) {
    const headerRow = rows[headerRowIndex];
    const irHeaderIndex = headerRow.findIndex((h) => typeof h === "string" && /^IR\b/i.test(h.trim()));
    const usdColIndex = headerRow.findIndex((h) => typeof h === "string" && /USD/i.test(h));
    if (irHeaderIndex >= 0) {
      const irHeaderText = String(headerRow[irHeaderIndex]);
      const pctMatch = irHeaderText.match(/(\d+(?:\.\d+)?)\s*%/);
      const firstTotalRowIndex = totalRowIndices.length > 0 ? totalRowIndices[0] : rows.length;

      if (pctMatch && netToMediaGross !== null) {
        irAmount = netToMediaGross * (Number(pctMatch[1]) / 100);
      } else if (/QAR/i.test(irHeaderText) || (!/USD/i.test(irHeaderText) && usdColIndex < 0)) {
        // Explicitly QAR, or no currency marker anywhere on the sheet to
        // suggest otherwise — trust the column's own values directly.
        let sum = 0;
        let found = false;
        for (let r = headerRowIndex + 1; r < firstTotalRowIndex; r++) {
          const v = numberAt(rows[r], irHeaderIndex);
          if (v !== null) {
            sum += v;
            found = true;
          }
        }
        if (found) irAmount = sum;
      } else if (usdColIndex >= 0 && qarColIndex >= 0) {
        // Header suggests USD (or is ambiguous while a USD column exists on
        // the sheet) — convert each row using that row's own real USD→QAR
        // ratio instead of a guessed fixed exchange rate.
        let sum = 0;
        let found = false;
        for (let r = headerRowIndex + 1; r < firstTotalRowIndex; r++) {
          const irValue = numberAt(rows[r], irHeaderIndex);
          const usdValue = numberAt(rows[r], usdColIndex);
          const qarValue = numberAt(rows[r], qarColIndex);
          if (irValue !== null && usdValue && qarValue !== null) {
            sum += irValue * (qarValue / usdValue);
            found = true;
          }
        }
        if (found) irAmount = sum;
        else irLowConfidence = true;
      } else {
        irLowConfidence = true;
      }
    }
  }

  // The rebate is carved out of the media budget before it reaches the
  // platform — the real, spendable Net to Media is the gross figure minus
  // IR, not the pre-rebate headline number.
  const netToMedia = netToMediaGross !== null ? netToMediaGross - (irAmount ?? 0) : null;

  let campaignStart: string | null = startDateLabelValue ? isoDate(startDateLabelValue) : null;
  let campaignEnd: string | null = endDateLabelValue ? isoDate(endDateLabelValue) : null;

  if (!campaignStart || !campaignEnd) {
    const parsedDuration = parseDurationRange(durationText);
    if (parsedDuration) {
      campaignStart = campaignStart ?? parsedDuration.start;
      campaignEnd = campaignEnd ?? parsedDuration.end;
    }
  }

  if (!clientRaw) warnings.push("Could not detect the client name — select one manually.");
  if (!campaignName) warnings.push("Could not detect the campaign name — enter it manually.");
  if (!campaignStart || !campaignEnd) warnings.push("Could not detect real campaign start/end dates — enter them manually.");
  if (netToClient === null) warnings.push(`Could not detect a total spend figure (${currency}) — enter it manually.`);
  if (netToMedia === null) warnings.push("Could not separate Net to Media from the client total in this file — enter it manually if needed.");
  if (agencyFeeAmount === null) warnings.push("No agency/campaign management fee row found in this file.");
  if (irAmount === null && !irLowConfidence) warnings.push("No IR (incentive rebate) row or column found in this file.");
  if (irLowConfidence) warnings.push("Found an IR column but couldn't verify its currency — enter the real IR value manually.");
  if (currencyLowConfidence) warnings.push("Couldn't find a QAR or USD marker anywhere on this sheet — confirm the real currency before importing.");
  if (channelLowConfidence) warnings.push("Couldn't confirm the real media channel for this file — please pick the correct one before importing.");

  return {
    sourceFile,
    clientRaw,
    campaignName,
    planCode,
    campaignStart,
    campaignEnd,
    currency,
    currencyLowConfidence,
    channel,
    channelLowConfidence,
    platformRows,
    netToMedia,
    netToClient,
    agencyFeeAmount,
    irAmount,
    warnings,
  };
}
