// Shape of one row persisted in OohEnrichmentBatch.pending — a row from an
// external asset spreadsheet that carries real data but didn't confidently
// match an existing asset. See scripts/one-off-ingest-ooh-new-suppliers.mts
// history (deleted after use) for how the first batch of these was produced.
export interface OohEnrichmentRow {
  row: number; // source spreadsheet row number, used with dbSupplier as a stable key
  assetName: string;
  supplier: string; // supplier name as it appeared in the source spreadsheet
  dbSupplier: string; // matching Supplier.name in this database
  staticDigital: "Static" | "Digital" | null;
  environment: string | null;
  format: string | null;
  subFormat: string | null;
  numFaces: number | string | null;
  dimensions: string | null;
  areaSqm: number | null;
  prices: Record<string, number>; // "1_day" | "1_week" | "2_week" | "1_month" | "3_month" | "6_month" | "12_month"
  // Sourced from a loosely-structured spreadsheet — most rows carry a clean
  // number, but some suppliers reported these as descriptive text (e.g.
  // "20,000+ daily riders on weekdays (supplier-stated)"), so the real data
  // can be a string here too.
  footfall: number | string | null;
  footfallPeriod: string | null;
  impressions: number | string | null;
  impressionPeriod: string | null;
  ots: number | string | null;
  origSupplierDesc: string | null;
  assetDescription: string | null;
  notes: string | null;
  location: string | null;
  area: string | null;
  municipality: string | null;
  lat: number | null;
  lon: number | null;
}

export function enrichmentRowKey(r: Pick<OohEnrichmentRow, "dbSupplier" | "row">): string {
  return `${r.dbSupplier}::${r.row}`;
}
