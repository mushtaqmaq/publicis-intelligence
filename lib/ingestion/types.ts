/**
 * Shared types for the rate-card ingestion pipeline.
 *
 * IMPORTANT — read before touching the parsers: source rate-card PDFs are
 * wildly inconsistent in layout (see docs/ingestion-notes.md for real
 * examples). Nothing here claims to reliably extract every field from
 * every supplier's document. Each candidate carries an explicit
 * `confidence`, and LOW-confidence candidates are expected and normal —
 * they exist so an Admin reviews and corrects them on the review screen,
 * never so they get silently published. Never raise a candidate's
 * confidence just to make the import summary look cleaner.
 */

export type ExtractionConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface CandidateFee {
  feeType: "production" | "upload" | "installation" | "service" | "other";
  amountRaw: string;
  amount: number | null;
}

export interface CandidateRate {
  /** e.g. "2 weeks", "4 weeks", "3 months" — verbatim from source where possible. */
  durationLabel: string | null;
  grossRateRaw: string | null;
  grossRate: number | null;
  fees: CandidateFee[];
}

export interface ParsedCandidate {
  /** Best-guess asset/location name, straight from the source text. */
  candidateAssetName: string;
  candidateLocation: string | null;
  sizeRaw: string | null;
  facesOrScreens: number | null;
  quantityLabel: string | null; // "Faces" | "Screens" | "Circuits" | "Poles" | null
  rates: CandidateRate[];
  /** Any monetary/number tokens found but not confidently attributed to a
   *  field above — surfaced to the reviewer rather than discarded. */
  unclassifiedAmounts: string[];
  sourcePage: number | null;
  sourceSnippet: string; // raw text block this candidate was extracted from
  confidence: ExtractionConfidence;
  confidenceReason: string;
}

export interface ParseResult {
  candidates: ParsedCandidate[];
  warnings: string[];
  pageCount: number | null;
}
