// Shapes the AVR tracker for the dashboard cards. Pure: takes the real schemes and the real spend, never invents a number.
// A supplier's spend is shared by all its categories (bookings are not tagged per AVR category yet).

export type IconKey = "monitor" | "billboard" | "signpost" | "store" | "cinema" | "rail" | "airport" | "bus" | "layers" | "pin";

// Picks an icon from the category name. Unknown names get a plain pin; "All Assets"/"General" get layers.
export function categoryIcon(category: string): IconKey {
  const c = category.toLowerCase();
  if (/^(all assets|general|all)$/.test(c.trim())) return "layers";
  if (/dooh|digital|screen|led/.test(c)) return "monitor";
  if (/large format|billboard|unipole|megacom|gantry/.test(c)) return "billboard";
  if (/small format|mupi|street furniture|bus shelter|lamp|pillar|bridge/.test(c)) return "signpost";
  if (/mall|oasis|retail|gate|west bay|\bab\b/.test(c)) return "store";
  if (/cinema|film/.test(c)) return "cinema";
  if (/rail|metro|train|tram/.test(c)) return "rail";
  if (/airport|hia|terminal/.test(c)) return "airport";
  if (/\bbus\b|transit|vehicle/.test(c)) return "bus";
  return "pin";
}

export type SlabIn = { thresholdFrom: number; rebatePct: number }; // rebatePct as a fraction, 0.04 = 4%
export type SchemeIn = { id: string; supplierName: string; category: string; slabs: SlabIn[] };

export type CategoryView = {
  id: string; category: string; icon: IconKey;
  slabs: { thresholdFrom: number; rebatePct: number; reached: boolean }[];
  currentRebatePct: number | null; nextThreshold: number | null; nextRebatePct: number | null;
  pending: number; // spend still needed for the next slab (0 at the top, or when there are no slabs)
  state: "no-slabs" | "below" | "mid" | "top";
  estimatedRebate: number;
};
export type SupplierCard = {
  supplier: string; spend: number; categories: CategoryView[];
  state: "no-slabs" | "below" | "mid" | "top";
  pending: number | null; // smallest pending among categories with a next slab; null when nothing is pending
  pendingCategory: string | null; pendingRebatePct: number | null;
  progressPct: number; // toward the nearest next slab (100 at the top)
  bestRebatePct: number | null; estimatedRebate: number;
};

export function categoryView(s: SchemeIn, spend: number): CategoryView {
  const slabs = [...s.slabs].sort((a, b) => a.thresholdFrom - b.thresholdFrom).map((x) => ({ ...x, reached: spend >= x.thresholdFrom }));
  const reached = slabs.filter((x) => x.reached);
  const current = reached.length ? reached[reached.length - 1] : null;
  const next = slabs.find((x) => !x.reached) ?? null;
  const state: CategoryView["state"] = slabs.length === 0 ? "no-slabs" : !current ? "below" : next ? "mid" : "top";
  return { id: s.id, category: s.category, icon: categoryIcon(s.category), slabs, currentRebatePct: current?.rebatePct ?? null, nextThreshold: next?.thresholdFrom ?? null, nextRebatePct: next?.rebatePct ?? null, pending: next ? next.thresholdFrom - spend : 0, state, estimatedRebate: current ? spend * current.rebatePct : 0 };
}

export function buildCards(schemes: SchemeIn[], spendBySupplier: Map<string, number>): SupplierCard[] {
  const by = new Map<string, SchemeIn[]>();
  for (const s of schemes) by.set(s.supplierName, [...(by.get(s.supplierName) ?? []), s]);
  const cards: SupplierCard[] = [...by.entries()].map(([supplier, list]) => {
    const spend = spendBySupplier.get(supplier) ?? 0;
    const categories = list.map((s) => categoryView(s, spend));
    const withNext = categories.filter((c) => c.nextThreshold !== null).sort((a, b) => a.pending - b.pending);
    const nearest = withNext[0] ?? null;
    const withSlabs = categories.filter((c) => c.state !== "no-slabs");
    const state: SupplierCard["state"] = withSlabs.length === 0 ? "no-slabs" : nearest ? (categories.some((c) => c.currentRebatePct !== null) ? "mid" : "below") : "top";
    const rebates = categories.map((c) => c.currentRebatePct).filter((x): x is number => x !== null);
    return {
      supplier, spend, categories, state,
      pending: nearest ? nearest.pending : null, pendingCategory: nearest ? nearest.category : null, pendingRebatePct: nearest?.nextRebatePct ?? null,
      progressPct: nearest ? Math.max(0, Math.min(100, (spend / nearest.nextThreshold!) * 100)) : state === "top" ? 100 : 0,
      bestRebatePct: rebates.length ? Math.max(...rebates) : null,
      estimatedRebate: categories.reduce((a, c) => a + c.estimatedRebate, 0),
    };
  });
  // closest to the next slab first, then those at the top, then those with no slabs entered
  const rank = (c: SupplierCard) => (c.pending !== null ? 0 : c.state === "top" ? 1 : 2);
  return cards.sort((a, b) => rank(a) - rank(b) || (a.pending ?? 0) - (b.pending ?? 0) || a.supplier.localeCompare(b.supplier));
}
