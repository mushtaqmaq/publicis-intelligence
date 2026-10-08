import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Runs only against a throwaway database: TEST_DATABASE_URL=postgresql://... npx vitest run lib/finance
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("finance against a real database", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let core: typeof import("@/lib/core/service");
  let after: typeof import("@/lib/core/afterDecision");
  const tag = `fn${Date.now()}`;
  const ids = { mgr: `${tag}-mgr`, staff: `${tag}-staff`, apr: `${tag}-apr`, boss: `${tag}-boss` };
  let clientId = "", otherClientId = "", supplierId = "", supplier2Id = "", assetId = "", asset2Id = "", catId = "", planId = "";
  const A = (k: keyof typeof ids, manager = false) => ({ id: ids[k], role: (k === "boss" ? "ADMIN" : k === "apr" ? "ACCOUNT_MANAGER" : "PLANNER") as never, manager });
  const line = (description: string, unitPrice: number, quantity = 1) => ({ description, quantity, unitPrice });
  const d = (s: string) => new Date(s + "T00:00:00Z");

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    svc = await import("./service"); core = await import("@/lib/core/service"); after = await import("@/lib/core/afterDecision");
    for (const [k, id] of Object.entries(ids)) await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x", role: k === "boss" ? "ADMIN" : k === "apr" ? "ACCOUNT_MANAGER" : "PLANNER" } });
    clientId = (await prisma.client.create({ data: { name: `Client ${tag}`, paymentTermsDays: 45, departments: ["media"] } })).id;
    otherClientId = (await prisma.client.create({ data: { name: `Other ${tag}` } })).id;
    supplierId = (await prisma.supplier.create({ data: { name: `Sup ${tag}` } })).id;
    supplier2Id = (await prisma.supplier.create({ data: { name: `Sup2 ${tag}` } })).id;
    catId = (await prisma.assetCategory.create({ data: { name: `Cat ${tag}` } })).id;
    assetId = (await prisma.asset.create({ data: { assetCode: `A-${tag}-1`, supplierId, assetName: "Billboard 1", mediaCategoryId: catId, locationName: "Corniche" } })).id;
    asset2Id = (await prisma.asset.create({ data: { assetCode: `A-${tag}-2`, supplierId: supplier2Id, assetName: "Mupi 2", mediaCategoryId: catId, locationName: "Souq" } })).id;
    const plan = await prisma.mediaPlan.create({ data: { planCode: `P-${tag}`, clientId, campaignName: "Plan camp", campaignStart: d("2027-03-01"), campaignEnd: d("2027-03-28"), status: "APPROVED" } });
    planId = plan.id;
    const v = await prisma.mediaPlanVersion.create({ data: { mediaPlanId: plan.id, versionNumber: 1, label: "V1" } });
    await prisma.mediaPlanItem.create({ data: { mediaPlanVersionId: v.id, assetId, startDate: d("2027-03-01"), endDate: d("2027-03-28"), rateSnapshot: {}, lineTotal: 12000, netMedia: 10000 } });
    await prisma.mediaPlanItem.create({ data: { mediaPlanVersionId: v.id, assetId: asset2Id, startDate: d("2027-03-01"), endDate: d("2027-03-28"), rateSnapshot: {}, lineTotal: 6000.5, netMedia: 5000 } });
  });
  afterAll(async () => {
    await prisma.financeAllocation.deleteMany({ where: { document: { OR: [{ clientId: { in: [clientId, otherClientId] } }, { supplierId: { in: [supplierId, supplier2Id] } }] } } });
    await prisma.financePayment.deleteMany({ where: { createdById: { in: Object.values(ids) } } });
    await prisma.approvalRequest.deleteMany({ where: { requestedById: { in: Object.values(ids) } } });
    await prisma.approvalTemplate.deleteMany({ where: { documentType: { in: ["QUOTATION", "PURCHASE_ORDER", "BILL"] } } });
    await prisma.financeDocument.updateMany({ where: { createdById: { in: Object.values(ids) } }, data: { parentId: null } });
    await prisma.financeDocument.deleteMany({ where: { createdById: { in: Object.values(ids) } } });
    await prisma.mediaPlan.deleteMany({ where: { id: planId } });
    await prisma.asset.deleteMany({ where: { id: { in: [assetId, asset2Id] } } });
    await prisma.assetCategory.delete({ where: { id: catId } });
    await prisma.supplier.deleteMany({ where: { id: { in: [supplierId, supplier2Id] } } });
    await prisma.client.deleteMany({ where: { id: { in: [clientId, otherClientId] } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it("totals are exact: lines, rounding, tax; lines cannot be negative quantity", async () => {
    const doc = await svc.createDocument(A("staff"), { type: "QUOTATION", clientId, taxRatePct: 5, lines: [line("A", 100.1, 3), line("B", 0.01, 1)] });
    expect(Number(doc.subtotal)).toBe(300.31); expect(Number(doc.taxAmount)).toBe(15.02); expect(Number(doc.total)).toBe(315.33);
    expect(doc.code).toMatch(/^QUO-\d{4,}$/);
    await expect(svc.createDocument(A("staff"), { type: "QUOTATION", clientId, lines: [line("x", 1, -1)] })).rejects.toThrow(/Quantity/);
    await expect(svc.createDocument(A("staff"), { type: "QUOTATION", clientId, supplierId, lines: [line("x", 1)] })).rejects.toThrow(/cannot have a supplier/);
  });

  it("only drafts can be edited", async () => {
    const q = await svc.createDocument(A("staff"), { type: "QUOTATION", clientId, lines: [line("Edit me", 100)] });
    await svc.updateDraft(A("staff"), q.id, { clientId, lines: [line("Edited", 250)] });
    expect(Number((await prisma.financeDocument.findUniqueOrThrow({ where: { id: q.id } })).total)).toBe(250);
    await svc.move(A("staff"), q.id, "SENT");
    await expect(svc.updateDraft(A("staff"), q.id, { clientId, lines: [line("Too late", 1)] })).rejects.toThrow(/Only a draft/);
  });

  it("invoices: numbered only when issued, gapless under concurrency, issuing/voiding needs a manager", async () => {
    const drafts = await Promise.all(Array.from({ length: 10 }, (_, i) => svc.createDocument(A("staff"), { type: "INVOICE", clientId, lines: [line(`Inv ${i}`, 1000)] })));
    expect(drafts.every((x) => x.code === null)).toBe(true);
    await expect(svc.move(A("staff"), drafts[0].id, "ISSUED")).rejects.toThrow(/finance manager/);
    await Promise.all(drafts.map((x) => svc.move(A("mgr", true), x.id, "ISSUED")));
    const issued = await prisma.financeDocument.findMany({ where: { id: { in: drafts.map((x) => x.id) } } });
    const nums = issued.map((x) => Number(x.code!.split("-")[1])).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(10); expect(nums[9] - nums[0]).toBe(9);
    const first = issued[0];
    expect(first.dueDate!.getTime() - first.issueDate!.getTime()).toBe(45 * 864e5); // client's payment terms
    await expect(svc.move(A("mgr", true), first.id, "ISSUED")).rejects.toThrow(/cannot be made/);
  });

  it("payments: whole amount allocated, no overpay, race-safe, voiding reopens", async () => {
    const mk = async (amt: number, cid = clientId) => { const i = await svc.createDocument(A("staff"), { type: "INVOICE", clientId: cid, lines: [line("Work", amt)] }); await svc.move(A("mgr", true), i.id, "ISSUED"); return i; };
    const inv = await mk(1000), inv2 = await mk(500), foreign = await mk(300, otherClientId);
    const pay = (documentId: string, amount: number, direction: "IN" | "OUT" = "IN", partyId = clientId) => svc.recordPayment(A("mgr", true), { direction, partyId, amount, paidOn: d("2026-01-05"), allocations: [{ documentId, amount }] });
    await expect(svc.recordPayment(A("staff"), { direction: "IN", partyId: clientId, amount: 10, paidOn: d("2026-01-05"), allocations: [{ documentId: inv.id, amount: 10 }] })).rejects.toThrow(/finance manager/);
    await expect(svc.recordPayment(A("mgr", true), { direction: "IN", partyId: clientId, amount: 100, paidOn: d("2026-01-05"), allocations: [{ documentId: inv.id, amount: 60 }] })).rejects.toThrow(/Allocate the whole/);
    await expect(pay(foreign.id, 300)).rejects.toThrow(/different client/);
    await expect(pay(inv.id, 1000.01)).rejects.toThrow(/only has 1000.00 outstanding/);
    const p1 = await pay(inv.id, 400);
    expect((await prisma.financeDocument.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PART_PAID");
    // two payments of 600 race for the last 600: exactly one wins
    const race = await Promise.allSettled([pay(inv.id, 600), pay(inv.id, 600)]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const paid = await prisma.financeDocument.findUniqueOrThrow({ where: { id: inv.id } });
    expect(paid.status).toBe("PAID"); expect(Number(paid.paidAmount)).toBe(1000);
    await expect(svc.move(A("mgr", true), inv.id, "VOID")).rejects.toThrow(/cannot be made/); // paid invoices cannot be voided
    await svc.voidPayment(A("mgr", true), p1.id);
    const reopened = await prisma.financeDocument.findUniqueOrThrow({ where: { id: inv.id } });
    expect(reopened.status).toBe("PART_PAID"); expect(Number(reopened.paidAmount)).toBe(600);
    await expect(svc.voidPayment(A("mgr", true), p1.id)).rejects.toThrow(/already void/);
    await expect(svc.move(A("mgr", true), inv2.id, "VOID")).resolves.toBeUndefined(); // unpaid invoice can be voided
    await expect(pay(inv2.id, 500)).rejects.toThrow(/cannot take a payment/);
    expect(await prisma.financePayment.count({ where: { code: { startsWith: "RCT-" }, voidedAt: null, createdById: ids.mgr } })).toBe(1); // p1 was voided; the race winner remains
  });

  it("quotation -> booking order -> staged invoices never exceed the order", async () => {
    const q = await svc.createDocument(A("staff"), { type: "QUOTATION", clientId, lines: [line("Campaign", 10000)] });
    await expect(svc.quotationToBookingOrder(A("staff"), q.id, "LPO-1")).rejects.toThrow(/accepted/);
    await svc.move(A("staff"), q.id, "SENT"); await svc.move(A("staff"), q.id, "ACCEPTED");
    const bo = await svc.quotationToBookingOrder(A("staff"), q.id, "LPO-77");
    await expect(svc.quotationToBookingOrder(A("staff"), q.id, "LPO-78")).rejects.toThrow(/already exists/);
    await expect(svc.orderToInvoice(A("staff"), bo.id)).rejects.toThrow(/confirmed/);
    await expect(svc.move(A("staff"), bo.id, "CONFIRMED", { reference: "  " })).rejects.toThrow(/LPO/);
    await svc.move(A("staff"), bo.id, "CONFIRMED", { reference: "LPO-77" });
    const i1 = await svc.orderToInvoice(A("staff"), bo.id, { percent: 60 });
    expect(Number(i1.total)).toBe(6000);
    await expect(svc.orderToInvoice(A("staff"), bo.id, { percent: 50 })).rejects.toThrow(/more than the order/);
    const i2 = await svc.orderToInvoice(A("staff"), bo.id, { percent: 40 });
    expect(Number(i2.total)).toBe(4000);
    await expect(svc.orderToInvoice(A("staff"), bo.id, { percent: 1 })).rejects.toThrow(/more than the order/);
    await svc.move(A("mgr", true), i1.id, "ISSUED"); await svc.move(A("mgr", true), i1.id, "VOID");
    await svc.orderToInvoice(A("staff"), bo.id, { percent: 60 }); // a voided invoice frees its share
  });

  it("purchase orders and bills: approval steps, billing caps, payment out", async () => {
    await core.saveApprovalTemplate(ids.boss, "PURCHASE_ORDER", "PO", [{ label: "Manager", approverUserId: ids.apr }]);
    const po = await svc.createDocument(A("staff"), { type: "PURCHASE_ORDER", supplierId, lines: [line("Site fee", 5000)] });
    await expect(svc.move(A("staff"), po.id, "SENT")).rejects.toThrow(/cannot be made/);
    await svc.submitForApproval(A("staff"), po.id);
    expect((await prisma.financeDocument.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PENDING_APPROVAL");
    const ap = await prisma.approvalRequest.findFirstOrThrow({ where: { documentType: "PURCHASE_ORDER", documentId: po.id } });
    await expect(core.actOnApproval(A("staff"), ap.id, "APPROVE")).rejects.toThrow();
    await core.actOnApproval(A("apr"), ap.id, "APPROVE"); await after.afterDecision(ap.id, ids.apr);
    expect((await prisma.financeDocument.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("APPROVED");
    await svc.move(A("staff"), po.id, "SENT");
    await expect(svc.orderPurchaseToBill(A("staff"), po.id, "")).rejects.toThrow(/invoice number/);
    const b1 = await svc.orderPurchaseToBill(A("staff"), po.id, "SUP-INV-1", { percent: 70 });
    await expect(svc.orderPurchaseToBill(A("staff"), po.id, "SUP-INV-2", { percent: 40 })).rejects.toThrow(/more than the purchase order/);
    // bill: set dates, submit (template for BILL absent -> straight to APPROVED), then pay
    await svc.updateDraft(A("staff"), b1.id, { supplierId, reference: "SUP-INV-1", issueDate: d("2027-01-02"), dueDate: d("2027-02-01"), lines: [line("70% of PO", 3500)] });
    await svc.submitForApproval(A("staff"), b1.id);
    const bill = await prisma.financeDocument.findUniqueOrThrow({ where: { id: b1.id } });
    expect(bill.status).toBe("APPROVED"); expect(bill.code).toMatch(/^BILL-/);
    await svc.recordPayment(A("mgr", true), { direction: "OUT", partyId: supplierId, amount: 3500, paidOn: d("2026-01-20"), allocations: [{ documentId: b1.id, amount: 3500 }] });
    expect((await prisma.financeDocument.findUniqueOrThrow({ where: { id: b1.id } })).status).toBe("PAID");
    // rejected approval returns a PO to REJECTED
    const po2 = await svc.createDocument(A("staff"), { type: "PURCHASE_ORDER", supplierId, lines: [line("Nope", 100)] });
    await svc.submitForApproval(A("staff"), po2.id);
    const ap2 = await prisma.approvalRequest.findFirstOrThrow({ where: { documentType: "PURCHASE_ORDER", documentId: po2.id } });
    await core.actOnApproval(A("apr"), ap2.id, "REJECT", "Over budget"); await after.afterDecision(ap2.id, ids.apr);
    expect((await prisma.financeDocument.findUniqueOrThrow({ where: { id: po2.id } })).status).toBe("REJECTED");
  });

  it("documents from a media plan: quotation from Net to Client, one PO per supplier from Net to Media", async () => {
    const q = await svc.quotationFromPlan(A("staff"), planId);
    expect(q.mediaPlanId).toBe(planId); expect(Number(q.total)).toBe(18000.5);
    await expect(svc.quotationFromPlan(A("staff"), planId)).rejects.toThrow(/already quotes/);
    const r = await svc.purchaseOrdersFromPlan(A("staff"), planId);
    expect(r.created.map((c) => c.supplier).sort()).toEqual([`Sup ${tag}`, `Sup2 ${tag}`]);
    const totals = await prisma.financeDocument.findMany({ where: { id: { in: r.created.map((c) => c.id) } }, select: { supplier: { select: { name: true } }, total: true } });
    expect(totals.map((t) => Number(t.total)).sort((a, b) => a - b)).toEqual([5000, 10000]);
    const again = await svc.purchaseOrdersFromPlan(A("staff"), planId);
    expect(again.created).toHaveLength(0); expect(again.skipped).toHaveLength(2);
    // a pending (TBD) cost is never turned into zero
    const plan2 = await prisma.mediaPlan.create({ data: { planCode: `P2-${tag}`, clientId, campaignName: "Pending", campaignStart: d("2027-04-01"), campaignEnd: d("2027-04-10"), status: "APPROVED" } });
    const v2 = await prisma.mediaPlanVersion.create({ data: { mediaPlanId: plan2.id, versionNumber: 1, label: "V1" } });
    await prisma.mediaPlanItem.create({ data: { mediaPlanVersionId: v2.id, assetId, startDate: d("2027-04-01"), endDate: d("2027-04-10"), rateSnapshot: {}, lineTotal: null, excludesPendingCost: true } });
    await expect(svc.quotationFromPlan(A("staff"), plan2.id)).rejects.toThrow(/pending/);
    await prisma.mediaPlan.update({ where: { id: planId }, data: { status: "DRAFT" } });
    await expect(svc.purchaseOrdersFromPlan(A("staff"), planId)).rejects.toThrow(/Share the plan/);
    await prisma.mediaPlan.delete({ where: { id: plan2.id } });
  });
});
