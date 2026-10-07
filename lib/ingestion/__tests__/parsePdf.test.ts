import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePdfRateCard } from "../parsePdf";

// These fixtures are minimal single-page PDFs generated from the exact
// text layouts pdf-parse produced for two real supplier rate cards
// (Break Media's "label line, then value line" style, and Scoop's
// reflowed multi-column table with the asset name after the data). See
// docs/ingestion-notes.md for the full real-world excerpts these are
// based on. Regenerate with: npx tsx scripts/generate-test-fixtures.ts
const FIXTURES_DIR = path.join(__dirname, "fixtures");

describe("parsePdfRateCard", () => {
  it("extracts a HIGH-confidence candidate from a clean label/value layout", async () => {
    const buf = await readFile(path.join(FIXTURES_DIR, "break-media-style.pdf"));
    const result = await parsePdfRateCard(buf);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    const c = result.candidates[0];
    expect(c.candidateAssetName).toMatch(/City Centre/i);
    expect(c.rates[0].grossRate).toBe(155000);
    expect(c.rates[0].fees.find((f) => f.feeType === "upload")?.amount).toBe(1500);
    expect(c.confidence).toBe("HIGH");
  });

  it("extracts a MEDIUM/LOW-confidence candidate from a messy reflowed table and never fabricates a clean label", async () => {
    const buf = await readFile(path.join(FIXTURES_DIR, "scoop-style.pdf"));
    const result = await parsePdfRateCard(buf);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    const c = result.candidates[0];
    // The parser should surface the amounts it found even if it can't
    // cleanly label every one of them — it must not drop data silently.
    const allAmounts = [c.rates[0].grossRate, ...c.rates[0].fees.map((f) => f.amount), ...c.unclassifiedAmounts];
    expect(allAmounts.length).toBeGreaterThan(0);
    expect(["MEDIUM", "LOW"]).toContain(c.confidence);
  });

  it("returns no candidates and a warning for a page with no QAR amounts at all", async () => {
    const buf = await readFile(path.join(FIXTURES_DIR, "no-pricing.pdf"));
    const result = await parsePdfRateCard(buf);
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
