import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseXlsxRateCard } from "../parseXlsx";
import { parseCsvRateCard } from "../parseCsv";

function buildWorkbookBuffer(rows: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parseXlsxRateCard", () => {
  it("extracts rows using a recognized header, matching Full Assets' own column names", () => {
    const buffer = buildWorkbookBuffer([
      ["Supplier", "Location / Asset Name", "Assets", "Gross Rate", "Production"],
      ["Elan", "Doha", "MUPIS", 120000, 6600],
      ["Elan", "Al Rayyan", "SENIORS", 157500, 22950],
    ]);
    const result = parseXlsxRateCard(buffer);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].candidateAssetName).toBe("MUPIS");
    expect(result.candidates[0].rates[0].grossRate).toBe(120000);
    expect(result.candidates[0].rates[0].fees[0].amount).toBe(6600);
  });

  it("skips rows with a blank asset name rather than fabricating one", () => {
    const buffer = buildWorkbookBuffer([
      ["Asset", "Gross Rate"],
      ["MUPIS", 120000],
      ["", 90000],
    ]);
    const result = parseXlsxRateCard(buffer);
    expect(result.candidates).toHaveLength(1);
  });

  it("warns instead of guessing when no recognizable header exists", () => {
    const buffer = buildWorkbookBuffer([
      ["Random", "Columns", "Here"],
      ["x", "y", "z"],
    ]);
    const result = parseXlsxRateCard(buffer);
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("parseCsvRateCard", () => {
  it("parses a simple comma-separated rate card", () => {
    const csv = 'Asset,Location,Gross Rate,Upload Fee\n"Digital Screen","The Halo",120000,1750\n';
    const result = parseCsvRateCard(Buffer.from(csv, "utf-8"));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].candidateAssetName).toBe("Digital Screen");
    expect(result.candidates[0].candidateLocation).toBe("The Halo");
    expect(result.candidates[0].rates[0].grossRate).toBe(120000);
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'Asset,Location,Gross Rate\n"MUPI, Large","Doha, West Bay",50000\n';
    const result = parseCsvRateCard(Buffer.from(csv, "utf-8"));
    expect(result.candidates[0].candidateAssetName).toBe("MUPI, Large");
    expect(result.candidates[0].candidateLocation).toBe("Doha, West Bay");
  });
});
