import * as XLSX from "xlsx";

export interface ParsedAvrSlab {
  threshold: number;
  rebatePct: number; // fraction, e.g. 0.05 for 5%
}

export interface ParsedAvrCategory {
  category: string;
  year: number;
  slabs: ParsedAvrSlab[];
}

// Real supplier AVR files (e.g. "AVR Elan.xlsx") lay out several category
// blocks stacked vertically in one sheet: a header row with the category
// name in column B and the year in column G, followed by 1+ rows of
// (threshold in column C, rebate % in column D) until the next category
// header or a blank gap. Everything else on the sheet (current spend/tier/
// AVR-value columns) is the source file's own point-in-time snapshot — we
// deliberately don't import it, since this app computes live spend from
// real bookings instead, which never goes stale the way an Excel snapshot
// does.
export function parseAvrExcel(buffer: Buffer): ParsedAvrCategory[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const results: ParsedAvrCategory[] = [];

  function cell(row: unknown[] | undefined, col: number): unknown {
    return row ? row[col] : null;
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const categoryLabel = cell(row, 1); // column B (0-indexed 1)
    const yearValue = cell(row, 6); // column G (0-indexed 6)

    const isHeaderRow =
      typeof categoryLabel === "string" &&
      categoryLabel.trim().length > 0 &&
      categoryLabel.trim() !== "%" &&
      typeof yearValue === "number" &&
      yearValue >= 2000 &&
      yearValue <= 2100;

    if (!isHeaderRow) continue;

    const slabs: ParsedAvrSlab[] = [];
    let rr = r + 1;
    while (rr < rows.length) {
      const slabRow = rows[rr];
      const nextLabel = cell(slabRow, 1);
      if (typeof nextLabel === "string" && nextLabel.trim().length > 0) break; // next category header

      const threshold = cell(slabRow, 2); // column C
      const rebatePct = cell(slabRow, 3); // column D
      if (typeof threshold === "number" && threshold > 0 && typeof rebatePct === "number" && rebatePct > 0 && rebatePct < 1) {
        slabs.push({ threshold, rebatePct });
        rr += 1;
      } else {
        break;
      }
    }

    if (slabs.length > 0) {
      results.push({ category: categoryLabel.trim(), year: yearValue, slabs });
    }
  }

  return results;
}
