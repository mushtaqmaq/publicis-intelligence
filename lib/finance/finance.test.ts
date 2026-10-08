import { describe, it, expect } from "vitest";
import { toMinor, fromMinor, lineAmountMinor, totals, fmtQar, MoneyError } from "./money";
import * as r from "./rules";
import { ageing, bucketOf, cashFlow, margin } from "./reports";
import { csvCell, toCsv } from "./csv";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("money", () => {
  it("converts to whole minor units without float drift", () => {
    expect(toMinor("1,234.56")).toBe(123456);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor("1.005")).toBe(101);
    expect(toMinor("-2.50")).toBe(-250);
    expect(fromMinor(123456)).toBe(1234.56);
    expect(() => toMinor("abc")).toThrow(MoneyError);
    expect(() => toMinor(Infinity)).toThrow(MoneyError);
  });
  it("line and document totals", () => {
    expect(lineAmountMinor(3, 3333)).toBe(9999);
    expect(lineAmountMinor(0.5, 101)).toBe(51);
    expect(() => lineAmountMinor(-1, 100)).toThrow(MoneyError);
    expect(totals([{ quantity: 2, unitPriceMinor: 10000 }, { quantity: 1, unitPriceMinor: 5050 }], 0)).toEqual({ subtotal: 25050, tax: 0, total: 25050 });
    expect(totals([{ quantity: 1, unitPriceMinor: 10001 }], 5)).toEqual({ subtotal: 10001, tax: 500, total: 10501 }); // 500.05 -> 500
    expect(() => totals([], 101)).toThrow(MoneyError);
    expect(fmtQar(123456)).toBe("QAR 1,234.56");
  });
});

describe("document rules", () => {
  it("only drafts are editable; moves follow the lifecycle", () => {
    expect(r.isEditable("DRAFT")).toBe(true);
    expect(r.isEditable("ISSUED")).toBe(false);
    expect(r.canMove("INVOICE", "DRAFT", "ISSUED")).toBe(true);
    expect(r.canMove("INVOICE", "PAID", "VOID")).toBe(false); // paid invoices cannot be voided
    expect(r.canMove("INVOICE", "ISSUED", "VOID")).toBe(true);
    expect(r.canMove("QUOTATION", "DRAFT", "ACCEPTED")).toBe(false);
    expect(r.canMove("QUOTATION", "SENT", "ACCEPTED")).toBe(true);
    expect(r.canMove("PURCHASE_ORDER", "DRAFT", "SENT")).toBe(false); // must be approved first
    expect(r.canMove("PURCHASE_ORDER", "APPROVED", "SENT")).toBe(true);
  });
  it("issuing needs lines, a total, a party and dates", () => {
    const ok = { total: 100, lines: 1, clientId: "c", issueDate: d("2027-01-01"), dueDate: d("2027-01-31") };
    expect(() => r.checkIssuable("INVOICE", ok)).not.toThrow();
    expect(() => r.checkIssuable("INVOICE", { ...ok, lines: 0 })).toThrow(/line/);
    expect(() => r.checkIssuable("INVOICE", { ...ok, total: 0 })).toThrow(/more than zero/);
    expect(() => r.checkIssuable("INVOICE", { ...ok, clientId: null })).toThrow(/client/);
    expect(() => r.checkIssuable("BILL", { ...ok, clientId: null })).toThrow(/supplier/);
    expect(() => r.checkIssuable("INVOICE", { ...ok, dueDate: d("2026-12-01") })).toThrow(/before/);
    expect(() => r.checkIssuable("INVOICE", { ...ok, dueDate: null })).toThrow(/dates|date/);
  });
  it("payment status follows the amount paid", () => {
    expect(r.statusAfterPayment(1000, 0, "ISSUED")).toBe("ISSUED");
    expect(r.statusAfterPayment(1000, 400, "ISSUED")).toBe("PART_PAID");
    expect(r.statusAfterPayment(1000, 1000, "PART_PAID")).toBe("PAID");
    expect(r.statusAfterPayment(1000, 0, "PAID")).toBe("ISSUED"); // a voided payment reopens the invoice
    expect(r.outstandingMinor(1000, 1200)).toBe(0);
  });
  it("overdue means past due with money outstanding", () => {
    const today = d("2027-02-10");
    expect(r.isOverdue(d("2027-02-09"), 100, today)).toBe(true);
    expect(r.isOverdue(d("2027-02-10"), 100, today)).toBe(false);
    expect(r.isOverdue(d("2027-02-01"), 0, today)).toBe(false);
  });
});

describe("ageing", () => {
  const today = d("2027-06-30");
  it("buckets by days past due", () => {
    expect(bucketOf(d("2027-07-05"), today)).toBe("Not yet due");
    expect(bucketOf(d("2027-06-30"), today)).toBe("Not yet due");
    expect(bucketOf(d("2027-06-29"), today)).toBe("1-30");
    expect(bucketOf(d("2027-05-31"), today)).toBe("1-30");
    expect(bucketOf(d("2027-05-30"), today)).toBe("31-60");
    expect(bucketOf(d("2027-04-01"), today)).toBe("61-90");
    expect(bucketOf(d("2027-01-01"), today)).toBe("90+");
  });
  it("totals per bucket and per party, ignoring settled items", () => {
    const a = ageing([
      { id: "1", party: "Acme", code: "INV-1", dueDate: d("2027-06-01"), outstanding: 1000 },
      { id: "2", party: "Acme", code: "INV-2", dueDate: d("2027-08-01"), outstanding: 500 },
      { id: "3", party: "Beta", code: "INV-3", dueDate: d("2026-12-01"), outstanding: 2500 },
      { id: "4", party: "Beta", code: "INV-4", dueDate: d("2027-01-01"), outstanding: 0 },
    ], today);
    expect(a.total).toEqual({ "Not yet due": 500, "1-30": 1000, "31-60": 0, "61-90": 0, "90+": 2500 });
    expect(a.grand).toBe(4000);
    expect(a.byParty.map((p) => [p.party, p.sum])).toEqual([["Beta", 2500], ["Acme", 1500]]);
  });
});

describe("margin", () => {
  it("actual versus projected, no division by zero", () => {
    const m = margin({ invoiced: 100000, billed: 70000, bookedNotInvoiced: 50000, poNotBilled: 30000 });
    expect(m.actual).toBe(30000); expect(m.actualPct).toBeCloseTo(30);
    expect(m.projected).toBe(50000); expect(m.projectedPct).toBeCloseTo(33.33, 1);
    const none = margin({ invoiced: 0, billed: 0, bookedNotInvoiced: 0, poNotBilled: 0 });
    expect(none.actualPct).toBeNull(); expect(none.projectedPct).toBeNull();
    expect(margin({ invoiced: 1000, billed: 1500, bookedNotInvoiced: 0, poNotBilled: 0 }).actual).toBe(-500);
  });
});

describe("cash flow", () => {
  const today = d("2027-06-30");
  it("places money in and out by week; overdue lands in week 1; undated and far-future are shown separately", () => {
    const cf = cashFlow(
      [{ date: d("2027-06-01"), amount: 1000, label: "overdue" }, { date: d("2027-07-08"), amount: 2000, label: "w2" }, { date: null, amount: 700, label: "?" }, { date: d("2028-06-01"), amount: 900, label: "far" }],
      [{ date: d("2027-07-01"), amount: 400, label: "bill" }, { date: d("2027-07-30"), amount: 600, label: "po" }],
      today, 13);
    expect(cf.rows[0]).toMatchObject({ in: 1000, out: 400, net: 600, cumulative: 600 });
    expect(cf.rows[1].in).toBe(2000);
    expect(cf.rows[4].out).toBe(600);
    expect(cf.rows[12].cumulative).toBe(1000 + 2000 - 400 - 600);
    expect(cf.undated).toEqual({ in: 700, out: 0 });
    expect(cf.beyond).toEqual({ in: 900, out: 0 });
  });
});

describe("csv export", () => {
  it("escapes and defuses formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-5")).toBe("-5"); // a plain negative number is fine
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(null)).toBe("");
    expect(csvCell(d("2027-01-02"))).toBe("2027-01-02");
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});
