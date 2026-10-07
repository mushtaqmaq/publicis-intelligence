// A supplier's own circuit numbering (e.g. Elan's "SE-009", "MU-114")
// groups many physical units under one product-type asset — this detects
// the shared prefix so those placemarks can be bulk-reviewed as one group
// instead of one row at a time.
export function detectPrefix(name: string): string {
  const m = name.match(/^([A-Za-z]+)-?/);
  return m ? m[1] : "(no prefix)";
}
