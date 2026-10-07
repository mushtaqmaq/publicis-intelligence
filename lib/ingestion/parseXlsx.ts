/**
 * Generic tabular rate-card parser (XLSX and CSV both funnel through this
 * once turned into a 2D array of cells). Unlike the PDF parser, a
 * spreadsheet rate card usually has an honest header row, so this can be
 * meaningfully more confident than the PDF path — but it still never
 * assumes a column exists; a rate card missing a "Production" column
 * simply produces assets with no production fee, not a fabricated zero.
 */
import * as XLSX from "xlsx";
import type { ParseResult, ParsedCandidate, CandidateFee, ExtractionConfidence } from "./types";

// Order matters: matchColumn checks fields in this order, and a column is
// only ever assigned to the first field whose synonym it matches. Put
// "location" before "assetName" so an ambiguously-named source column like
// the historical OOH_Rates_2026.xlsx's "Location / Asset Name" (which
// actually holds the area, not the asset name — see
// docs/excel-migration-notes.md) is read as location, not asset name.
const HEADER_SYNONYMS: Record<string, string[]> = {
  location: ["location / asset name", "location / area", "location", "area", "site"],
  assetName: ["asset name", "asset", "media", "location/asset"],
  grossRate: ["gross rate", "rate", "rental cost", "gross"],
  duration: ["duration", "period", "rate period", "campaign duration"],
  production: ["production", "production fee", "production cost", "production / upload fee"],
  upload: ["upload fee", "upload"],
  installation: ["installation", "installation fee"],
  service: ["service fee", "service"],
  faces: ["faces", "number of faces", "#faces"],
  circuits: ["circuits", "number of circuits", "#circuits"],
  size: ["size", "dimensions", "width x height"],
};

function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function matchColumn(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((raw, idx) => {
    const h = normalizeHeader(raw);
    // Each column is assigned to at most one field: the first (highest
    // priority, per HEADER_SYNONYMS order) field whose synonym it matches.
    // Without this early exit, an ambiguous header like "Location / Asset
    // Name" would satisfy both `location`'s and `assetName`'s synonyms and
    // get double-assigned.
    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
      if (map[field] !== undefined) continue;
      if (synonyms.some((s) => h === s || h.includes(s))) {
        map[field] = idx;
        break;
      }
    }
  });
  return map;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned !== "" ? n : null;
}

/** Finds the most plausible header row: the first row where at least two
 *  recognized column synonyms are found. Real workbooks often have title
 *  rows above the real header (see OOH_Rates_2026.xlsx's own "Full Assets"
 *  sheet, which starts data at row 1 with no preamble, but other supplier
 *  workbooks are not always that clean). */
function findHeaderRow(rows: unknown[][]): { rowIndex: number; columnMap: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const headers = row.map((c) => (c === null || c === undefined ? "" : String(c)));
    const columnMap = matchColumn(headers);
    if (Object.keys(columnMap).length >= 2 && columnMap.assetName !== undefined) {
      return { rowIndex: i, columnMap };
    }
  }
  return null;
}

export function parseTabularRateCard(rows: unknown[][]): ParseResult {
  const warnings: string[] = [];
  const header = findHeaderRow(rows);

  if (!header) {
    warnings.push(
      "Could not find a header row containing a recognizable asset-name column " +
        "(e.g. 'Asset', 'Location / Asset Name'). No candidates were extracted automatically " +
        "— this file may need a supplier-specific column mapping added, or manual entry."
    );
    return { candidates: [], warnings, pageCount: null };
  }

  const { rowIndex, columnMap } = header;
  const candidates: ParsedCandidate[] = [];

  for (let r = rowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const nameCell = row[columnMap.assetName];
    if (nameCell === null || nameCell === undefined || String(nameCell).trim() === "") continue;

    const fees: CandidateFee[] = [];
    for (const [field, feeType] of [
      ["production", "production"],
      ["upload", "upload"],
      ["installation", "installation"],
      ["service", "service"],
    ] as const) {
      const colIdx = columnMap[field];
      if (colIdx === undefined) continue;
      const raw = row[colIdx];
      const amount = toNumber(raw);
      if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
        fees.push({ feeType, amountRaw: String(raw), amount });
      }
    }

    const grossRaw = columnMap.grossRate !== undefined ? row[columnMap.grossRate] : null;
    const grossRate = toNumber(grossRaw);
    const hasAnyRateData = grossRate !== null || fees.length > 0;

    const confidence: ExtractionConfidence = hasAnyRateData ? "HIGH" : "MEDIUM";
    const confidenceReason = hasAnyRateData
      ? "Extracted from a recognized spreadsheet column header."
      : "Asset name found but no gross rate or fee column had a value for this row.";

    candidates.push({
      candidateAssetName: String(nameCell).trim(),
      candidateLocation:
        columnMap.location !== undefined && row[columnMap.location]
          ? String(row[columnMap.location]).trim()
          : null,
      sizeRaw:
        columnMap.size !== undefined && row[columnMap.size] ? String(row[columnMap.size]) : null,
      facesOrScreens:
        columnMap.faces !== undefined ? toNumber(row[columnMap.faces]) : columnMap.circuits !== undefined ? toNumber(row[columnMap.circuits]) : null,
      quantityLabel: columnMap.faces !== undefined ? "Faces" : columnMap.circuits !== undefined ? "Circuits" : null,
      rates: [
        {
          durationLabel:
            columnMap.duration !== undefined && row[columnMap.duration]
              ? String(row[columnMap.duration])
              : null,
          grossRateRaw: grossRaw !== null && grossRaw !== undefined ? String(grossRaw) : null,
          grossRate,
          fees,
        },
      ],
      unclassifiedAmounts: [],
      sourcePage: null,
      sourceSnippet: row.map((c) => (c === null || c === undefined ? "" : String(c))).join(" | "),
      confidence,
      confidenceReason,
    });
  }

  if (candidates.length === 0) {
    warnings.push("Header row found, but no data rows below it had a value in the asset-name column.");
  }

  return { candidates, warnings, pageCount: null };
}

export function parseXlsxRateCard(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const allResults: ParseResult = { candidates: [], warnings: [], pageCount: null };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    const result = parseTabularRateCard(rows);
    if (result.candidates.length > 0) {
      allResults.candidates.push(...result.candidates);
    } else if (result.warnings.length > 0 && wb.SheetNames.length === 1) {
      // Only surface the "no header found" warning when there's a single
      // sheet — with multiple sheets it's expected that some (e.g. a
      // notes/cover sheet) won't parse.
      allResults.warnings.push(...result.warnings.map((w) => `Sheet "${sheetName}": ${w}`));
    }
  }

  if (allResults.candidates.length === 0 && allResults.warnings.length === 0) {
    allResults.warnings.push(
      `No sheet in this workbook had a recognizable rate-card header across ${wb.SheetNames.length} sheet(s).`
    );
  }

  return allResults;
}
