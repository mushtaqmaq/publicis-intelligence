// Ageing, margin and cash-flow calculations (pure; all amounts in minor units).
const DAY = 864e5;
const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export const BUCKETS = ["Not yet due", "1-30", "31-60", "61-90", "90+"] as const;
export type Bucket = (typeof BUCKETS)[number];

export function bucketOf(dueDate: Date, today: Date): Bucket {
  const late = Math.floor((startOfDay(today) - startOfDay(dueDate)) / DAY);
  if (late <= 0) return "Not yet due";
  if (late <= 30) return "1-30";
  if (late <= 60) return "31-60";
  if (late <= 90) return "61-90";
  return "90+";
}

export type Open = { id: string; party: string; code: string; dueDate: Date; outstanding: number };
export function ageing(items: Open[], today: Date) {
  const total: Record<Bucket, number> = { "Not yet due": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const byParty = new Map<string, Record<Bucket, number>>();
  for (const i of items) {
    if (i.outstanding <= 0) continue;
    const b = bucketOf(i.dueDate, today);
    total[b] += i.outstanding;
    const row = byParty.get(i.party) ?? { "Not yet due": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    row[b] += i.outstanding; byParty.set(i.party, row);
  }
  return { total, grand: Object.values(total).reduce((a, b) => a + b, 0), byParty: [...byParty.entries()].map(([party, r]) => ({ party, ...r, sum: Object.values(r).reduce((a, b) => a + b, 0) })).sort((a, b) => b.sum - a.sum) };
}

// Margin for one campaign. Actual = issued invoices - bills received. Projected adds what is contracted but not yet
// invoiced/billed (confirmed booking orders, open purchase orders). Costs that were never entered are not guessed.
export type MarginIn = { invoiced: number; billed: number; bookedNotInvoiced: number; poNotBilled: number };
export function margin(m: MarginIn) {
  const actual = m.invoiced - m.billed;
  const revenue = m.invoiced + m.bookedNotInvoiced, cost = m.billed + m.poNotBilled;
  const projected = revenue - cost;
  return { actual, actualPct: m.invoiced > 0 ? (actual / m.invoiced) * 100 : null, projected, projectedPct: revenue > 0 ? (projected / revenue) * 100 : null, revenue, cost };
}

// Weekly cash flow: money in = open invoices on their due date (overdue lands in week 1) plus booked-not-invoiced
// orders at their end of campaign + client terms; money out = open bills on their due date plus approved/sent
// purchase orders not yet billed at their due date. Unknown dates are listed separately, never invented.
export type Flow = { date: Date | null; amount: number; label: string };
export function cashFlow(inflows: Flow[], outflows: Flow[], today: Date, weeks = 13) {
  const t0 = startOfDay(today);
  const rows = Array.from({ length: weeks }, (_, i) => ({ weekStart: new Date(t0 + i * 7 * DAY), in: 0, out: 0, net: 0, cumulative: 0 }));
  const undated = { in: 0, out: 0 }; let beyond = { in: 0, out: 0 };
  const place = (f: Flow, key: "in" | "out") => {
    if (!f.date) { undated[key] += f.amount; return; }
    const idx = Math.max(0, Math.floor((startOfDay(f.date) - t0) / (7 * DAY)));
    if (idx >= weeks) beyond = { ...beyond, [key]: beyond[key] + f.amount }; else rows[idx][key] += f.amount;
  };
  inflows.forEach((f) => place(f, "in")); outflows.forEach((f) => place(f, "out"));
  let run = 0;
  for (const r of rows) { r.net = r.in - r.out; run += r.net; r.cumulative = run; }
  return { rows, undated, beyond };
}
