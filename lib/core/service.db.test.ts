import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Runs only against a throwaway database: TEST_DATABASE_URL=postgresql://... npx vitest run lib/core/service.db.test.ts
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("shared core against a real database", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  const tag = `t${Date.now()}`;
  const ids = { maker: `${tag}-maker`, mgr: `${tag}-mgr`, fin: `${tag}-fin`, other: `${tag}-other` };
  let clientId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    svc = await import("./service");
    for (const [k, id] of Object.entries(ids)) await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x", role: k === "mgr" ? "ACCOUNT_MANAGER" : k === "fin" ? "ADMIN" : "PLANNER" } });
    clientId = (await prisma.client.create({ data: { name: `Client ${tag}` } })).id;
  });
  afterAll(async () => {
    await prisma.link.deleteMany({ where: { addedById: { in: Object.values(ids) } } });
    await prisma.comment.deleteMany({ where: { authorId: { in: Object.values(ids) } } });
    await prisma.campaign.deleteMany({ where: { clientId } });
    await prisma.approvalRequest.deleteMany({ where: { requestedById: { in: Object.values(ids) } } });
    await prisma.approvalTemplate.deleteMany({ where: { documentType: "TEST_DOC" } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await prisma.client.delete({ where: { id: clientId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it("numbers campaigns without gaps or duplicates, even when created at the same moment", async () => {
    const made = await Promise.all(Array.from({ length: 15 }, (_, i) => svc.createCampaign(ids.maker, { name: `C${i}`, clientId })));
    const nums = made.map((c) => Number(c.code.split("-")[1])).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(15);
    expect(nums[14] - nums[0]).toBe(14); // consecutive
  });

  it("rolls the number back when the document is not saved", async () => {
    const { nextNumber } = await import("./sequence");
    const peek = async () => (await prisma.documentSequence.findUnique({ where: { key: "CMP" } }))!.nextValue;
    const before = await peek();
    await prisma.$transaction(async (tx) => { await nextNumber(tx as never, "CMP"); throw new Error("abort"); }).catch(() => {});
    expect(await peek()).toBe(before);
  });

  it("stores links to a campaign and rejects unsafe ones", async () => {
    const c = await svc.createCampaign(ids.maker, { name: "Linked", clientId });
    await svc.addLink(ids.maker, { entityType: "Campaign", entityId: c.id, title: "Brief", url: "https://drive.example.com/brief", kind: "BRIEF" });
    await expect(svc.addLink(ids.maker, { entityType: "Campaign", entityId: c.id, title: "x", url: "javascript:alert(1)", kind: "BRIEF" })).rejects.toThrow(/http/);
    await expect(svc.addLink(ids.maker, { entityType: "Client", entityId: clientId, title: "x", url: "https://a.com", kind: "BRIEF" })).rejects.toThrow(/cannot be added/);
    const links = await prisma.link.findMany({ where: { entityType: "Campaign", entityId: c.id } });
    expect(links.map((l) => l.kind)).toEqual(["BRIEF"]);
  });

  it("runs a two-step approval assigned to named people, end to end", async () => {
    await svc.saveApprovalTemplate(ids.fin, "TEST_DOC", "Test", [{ label: "Manager", approverUserId: ids.mgr }, { label: "Finance", approverUserId: ids.fin }]);
    const maker = { id: ids.maker, role: "PLANNER" as const };
    const req = await svc.submitApproval(maker, { documentType: "TEST_DOC", documentId: "doc1", title: "Doc 1", amount: 1000 });
    await expect(svc.submitApproval(maker, { documentType: "TEST_DOC", documentId: "doc1", title: "again" })).rejects.toThrow(/already has an approval/);
    expect((await svc.myPendingApprovals({ id: ids.fin, role: "ADMIN" })).length).toBe(0); // not finance's turn yet
    expect((await svc.myPendingApprovals({ id: ids.mgr, role: "ACCOUNT_MANAGER" })).map((r) => r.id)).toContain(req.id);
    await expect(svc.actOnApproval({ id: ids.other, role: "PLANNER" }, req.id, "APPROVE")).rejects.toThrow(/assigned to someone else/);
    await expect(svc.actOnApproval(maker, req.id, "APPROVE")).rejects.toThrow(/own request/);
    expect(await svc.actOnApproval({ id: ids.mgr, role: "ACCOUNT_MANAGER" }, req.id, "APPROVE", "ok")).toBe("PENDING");
    expect((await svc.myPendingApprovals({ id: ids.fin, role: "ADMIN" })).map((r) => r.id)).toContain(req.id);
    expect(await svc.actOnApproval({ id: ids.fin, role: "ADMIN" }, req.id, "APPROVE")).toBe("APPROVED");
    const done = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id }, include: { steps: { orderBy: { stepOrder: "asc" } } } });
    expect(done.status).toBe("APPROVED");
    expect(done.steps.map((s) => [s.status, s.actedById])).toEqual([["APPROVED", ids.mgr], ["APPROVED", ids.fin]]);
    expect(await prisma.auditLog.count({ where: { entityType: "TEST_DOC", entityId: "doc1" } })).toBe(3);
  });

  it("lets only one of two simultaneous decisions win", async () => {
    const maker = { id: ids.maker, role: "PLANNER" as const };
    const req = await svc.submitApproval(maker, { documentType: "TEST_DOC", documentId: "doc2", title: "Doc 2" });
    const mgr = { id: ids.mgr, role: "ACCOUNT_MANAGER" as const };
    const results = await Promise.allSettled([svc.actOnApproval(mgr, req.id, "APPROVE"), svc.actOnApproval(mgr, req.id, "REJECT", "no")]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const steps = await prisma.approvalStep.findMany({ where: { requestId: req.id } });
    expect(steps.filter((s) => s.actedById).length).toBe(1);
  });

  it("rejection closes the request and skips later steps; cancel works for the requester", async () => {
    const maker = { id: ids.maker, role: "PLANNER" as const };
    const r1 = await svc.submitApproval(maker, { documentType: "TEST_DOC", documentId: "doc3", title: "Doc 3" });
    await svc.actOnApproval({ id: ids.mgr, role: "ACCOUNT_MANAGER" }, r1.id, "REJECT", "Not now");
    const s = await prisma.approvalStep.findMany({ where: { requestId: r1.id }, orderBy: { stepOrder: "asc" } });
    expect(s.map((x) => x.status)).toEqual(["REJECTED", "SKIPPED"]);
    const r2 = await svc.submitApproval(maker, { documentType: "TEST_DOC", documentId: "doc4", title: "Doc 4" });
    await svc.cancelApproval(maker, r2.id);
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("CANCELLED");
  });
});
