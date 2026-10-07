/**
 * Best-effort PDF rate-card parser.
 *
 * Real supplier PDFs are not structured documents — see
 * docs/ingestion-notes.md for two actual layouts side by side (Break
 * Media's clean "label line, then value line" pattern vs. Scoop's
 * multi-column table reflowed into tab-separated lines with the asset
 * name appearing *after* the data). This parser treats each PDF page as
 * one candidate asset record (true often enough across the supplier decks
 * inspected to be a reasonable default), extracts whatever labeled
 * amounts, duration, size, and heading text it can find, and is explicit
 * about what it could not confidently attribute rather than guessing.
 *
 * This is deliberately NOT a general-purpose PDF table extractor. Its job
 * is to produce a useful first draft for a human reviewer, per the
 * project's own rule that low-confidence extraction must be surfaced, not
 * silently cleaned up into something that looks more certain than it is.
 */
import type { ParseResult, ParsedCandidate, CandidateFee, ExtractionConfidence } from "./types";

const NOISE_LINE_PATTERNS = [
  /rate card/i,
  /^©\s?\d{4}/,
  /\|\s*rate card/i,
  /communications co\./i,
  /^page \d+/i,
];

const FEE_LABELS: Array<{ pattern: RegExp; feeType: CandidateFee["feeType"] }> = [
  { pattern: /production(?:\s*(?:cost|fee))?/i, feeType: "production" },
  { pattern: /upload fee/i, feeType: "upload" },
  { pattern: /install(?:ation)?/i, feeType: "installation" },
  { pattern: /service fee/i, feeType: "service" },
  { pattern: /printing\s*(?:&|and)\s*installation/i, feeType: "installation" },
];

const GROSS_RATE_LABELS =
  /gross rate|rental cost|rate per (?:screen|circuit|pole|face|network)/i;

const AMOUNT_RE = /(?:QAR\s*([\d,]+(?:\.\d+)?))|(?:([\d,]+(?:\.\d+)?)\s*QAR)/gi;
const DURATION_RE = /\b(\d+)\s*(week|weeks|month|months|year|years)\b/i;
const SIZE_RE = /\b\d+(?:\.\d+)?\s*m(?:eters)?\s*[x×]\s*\d+(?:\.\d+)?\s*m(?:eters)?\b/i;
const QUANTITY_RE = /\b(\d+)\s*(faces|screens|circuits|poles|networks)\b/i;

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return NOISE_LINE_PATTERNS.some((p) => p.test(trimmed));
}

function looksLikeLabelOrData(line: string): boolean {
  if (AMOUNT_RE.test(line)) return true;
  AMOUNT_RE.lastIndex = 0;
  if (FEE_LABELS.some((f) => f.pattern.test(line))) return true;
  if (GROSS_RATE_LABELS.test(line)) return true;
  if (/^duration|^size|^measurement|^campaign duration|^starting day|^material specs|^slot duration|^number of/i.test(line.trim())) {
    return true;
  }
  if (DURATION_RE.test(line) || SIZE_RE.test(line) || QUANTITY_RE.test(line)) return true;
  return false;
}

function extractAmounts(text: string): Array<{ raw: string; value: number }> {
  const results: Array<{ raw: string; value: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(AMOUNT_RE);
  while ((m = re.exec(text)) !== null) {
    const numStr = m[1] ?? m[2];
    const value = Number(numStr.replace(/,/g, ""));
    if (Number.isFinite(value)) {
      results.push({ raw: m[0].trim(), value });
    }
  }
  return results;
}

function findHeadingLine(lines: string[], lastAmountLineIndex: number): string | null {
  const candidates: Array<{ line: string; index: number }> = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (isNoiseLine(trimmed)) return;
    if (looksLikeLabelOrData(trimmed)) return;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return; // bare section numbers like "1.1"
    if (trimmed.length < 2 || trimmed.length > 80) return;
    candidates.push({ line: trimmed, index });
  });
  if (candidates.length === 0) return null;
  // Prefer a heading that appears after the last amount (Scoop-style),
  // falling back to the first candidate on the page (Break Media-style).
  const after = candidates.filter((c) => c.index > lastAmountLineIndex);
  if (after.length > 0) return after[0].line;
  return candidates[0].line;
}

function classifyPage(pageText: string, pageNum: number): ParsedCandidate | null {
  const lines = pageText.split("\n");
  const amounts = extractAmounts(pageText);
  if (amounts.length === 0) return null; // no pricing on this page — not a candidate

  // Find the line index of the last amount occurrence for heading placement.
  let lastAmountLineIndex = -1;
  lines.forEach((line, idx) => {
    if (extractAmounts(line).length > 0) lastAmountLineIndex = idx;
  });

  const heading = findHeadingLine(lines, lastAmountLineIndex);

  // Attribute amounts to labels using nearest-line proximity.
  const used = new Set<number>();
  const fees: CandidateFee[] = [];
  let grossRate: { raw: string; value: number } | null = null;

  // Try direct same-line labeling first (Break Media style: "Gross Rate\nQAR 155,000").
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i];
    const nextLineAmounts = i + 1 < lines.length ? extractAmounts(lines[i + 1]) : [];
    if (nextLineAmounts.length === 0) continue;
    const feeMatch = FEE_LABELS.find((f) => f.pattern.test(label));
    if (feeMatch) {
      const amt = nextLineAmounts[0];
      const globalIdx = amounts.findIndex((a) => a.raw === amt.raw && !used.has(amounts.indexOf(a)));
      if (globalIdx >= 0) used.add(globalIdx);
      fees.push({ feeType: feeMatch.feeType, amountRaw: amt.raw, amount: amt.value });
    } else if (GROSS_RATE_LABELS.test(label) && !grossRate) {
      grossRate = nextLineAmounts[0];
      const globalIdx = amounts.findIndex((a) => a.raw === grossRate!.raw);
      if (globalIdx >= 0) used.add(globalIdx);
    }
  }

  // Fallback: if nothing was labeled directly but exactly one amount exists
  // on the page, treat it as the gross rate (common on simple one-line-item
  // pages). Otherwise leave amounts unclassified for the reviewer.
  if (!grossRate && fees.length === 0 && amounts.length === 1) {
    grossRate = amounts[0];
    used.add(0);
  }

  const unclassifiedAmounts = amounts
    .filter((_, idx) => !used.has(idx))
    .map((a) => a.raw);

  const durationMatch = pageText.match(DURATION_RE);
  const sizeMatch = pageText.match(SIZE_RE);
  const quantityMatch = pageText.match(QUANTITY_RE);

  let confidence: ExtractionConfidence;
  let confidenceReason: string;
  if (heading && grossRate && unclassifiedAmounts.length === 0) {
    confidence = "HIGH";
    confidenceReason = "Single heading and a clearly labeled gross rate; no leftover amounts.";
  } else if (heading && (grossRate || fees.length > 0)) {
    confidence = "MEDIUM";
    confidenceReason = unclassifiedAmounts.length > 0
      ? `Heading and at least one labeled amount found, but ${unclassifiedAmounts.length} amount(s) on this page could not be confidently attributed to a field.`
      : "Heading and labeled amount(s) found.";
  } else {
    confidence = "LOW";
    confidenceReason = !heading
      ? "Could not isolate a single confident asset-name heading on this page."
      : "Found monetary amounts but could not confidently label them (no recognized field keyword nearby).";
  }

  return {
    candidateAssetName: heading ?? `Unnamed asset (page ${pageNum})`,
    candidateLocation: null,
    sizeRaw: sizeMatch ? sizeMatch[0] : null,
    facesOrScreens: quantityMatch ? Number(quantityMatch[1]) : null,
    quantityLabel: quantityMatch ? quantityMatch[2] : null,
    rates: [
      {
        durationLabel: durationMatch ? `${durationMatch[1]} ${durationMatch[2]}` : null,
        grossRateRaw: grossRate?.raw ?? null,
        grossRate: grossRate?.value ?? null,
        fees,
      },
    ],
    unclassifiedAmounts,
    sourcePage: pageNum,
    sourceSnippet: pageText.slice(0, 1000),
    confidence,
    confidenceReason,
  };
}

export async function parsePdfRateCard(buffer: Buffer): Promise<ParseResult> {
  // Loaded on first use, not at import: pdf-parse needs browser globals (DOMMatrix) that only exist once its optional
  // canvas package is present, and importing it eagerly crashed every page that merely imported this module.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const candidates: ParsedCandidate[] = [];
    const warnings: string[] = [];

    for (const page of result.pages) {
      if (!page.text.includes("QAR")) continue; // skip cover/prose pages entirely
      const candidate = classifyPage(page.text, page.num);
      if (candidate) candidates.push(candidate);
    }

    if (candidates.length === 0) {
      warnings.push(
        "No pages containing a recognizable QAR amount were found. This document may be " +
          "primarily image-based (scanned or graphic layout) rather than extractable text — " +
          "manual entry may be required for its assets."
      );
    }
    const lowConfidenceCount = candidates.filter((c) => c.confidence === "LOW").length;
    if (lowConfidenceCount > 0) {
      warnings.push(
        `${lowConfidenceCount} of ${candidates.length} extracted candidate(s) are LOW confidence ` +
          "and need manual review before publishing."
      );
    }

    return { candidates, warnings, pageCount: result.total };
  } finally {
    await parser.destroy();
  }
}
