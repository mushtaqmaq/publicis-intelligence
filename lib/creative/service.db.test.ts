import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Runs only against a throwaway database: TEST_DATABASE_URL=postgresql://... npx vitest run lib/creative
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("creative workflow against a real database", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let core: typeof import("@/lib/core/service");
  let after: typeof import("@/lib/core/afterDecision");
  const tag = `cr${Date.now()}`;
  const ids = { req: `${tag}-req`, des: `${tag}-des`, rev: `${tag}-rev`, boss: `${tag}-boss` };
  let creativeClient = "", mediaClient = "";
  const A = (k: keyof typeof ids, manager = false) => ({ id: ids[k], role: (k === "rev" ? "ACCOUNT_MANAGER" : k === "boss" ? "ADMIN" : "PLANNER") as never, manager });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    svc = await import("./service"); core = await import("@/lib/core/service"); after = await import("@/lib/core/afterDecision");
    for (const [k, id] of Object.entries(ids)) await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x", role: k === "rev" ? "ACCOUNT_MANAGER" : k === "boss" ? "ADMIN" : "PLANNER" } });
    creativeClient = (await prisma.client.create({ data: { name: `C ${tag}`, departments: ["creative"] } })).id;
    mediaClient = (await prisma.client.create({ data: { name: `M ${tag}`, departments: ["media"] } })).id;
  });
  afterAll(async () => {
    const reqs = await prisma.creativeRequest.findMany({ where: { clientId: { in: [creativeClient, mediaClient] } }, select: { id: true } });
    const vers = await prisma.creativeVersion.findMany({ where: { requestId: { in: reqs.map((r) => r.id) } }, select: { id: true } });
    await prisma.approvalRequest.deleteMany({ where: { documentId: { in: vers.map((v) => v.id) } } });
    await prisma.link.deleteMany({ where: { entityId: { in: reqs.map((r) => r.id) } } });
    await prisma.creativeRequest.deleteMany({ where: { clientId: { in: [creativeClient, mediaClient] } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await prisma.client.deleteMany({ where: { id: { in: [creativeClient, mediaClient] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  const brief = "A short but real brief for the designer.";
  it("only accepts clients that Creative handles, and keeps campaign/client consistent", async () => {
    await expect(svc.createRequest(A("req"), { title: "x", kind: "DESIGN", brief, priority: "NORMAL", clientId: mediaClient })).rejects.toThrow(/not handled by Creative/);
    const other = await prisma.campaign.create({ data: { code: `T-${tag}`, name: "other", clientId: mediaClient } });
    await expect(svc.createRequest(A("req"), { title: "x", kind: "DESIGN", brief, priority: "NORMAL", clientId: creativeClient, campaignId: other.id })).rejects.toThrow(/different client/);
    await prisma.campaign.delete({ where: { id: other.id } });
    await expect(svc.createRequest(A("req"), { title: "x", kind: "DESIGN", brief: "short", priority: "NORMAL", clientId: creativeClient })).rejects.toThrow(/brief/);
  });

  it("numbers requests, stores brief links, and refuses unsafe links", async () => {
    const r = await svc.createRequest(A("req"), { title: "T", kind: "DESIGN", brief, priority: "NORMAL", clientId: creativeClient, briefLinks: [{ title: "Brand", url: "https://x.example.com/b" }] });
    expect(r.code).toMatch(/^CRQ-\d{4,}$/);
    expect(await prisma.link.count({ where: { entityType: "CreativeRequest", entityId: r.id } })).toBe(1);
    await expect(svc.createRequest(A("req"), { title: "T", kind: "DESIGN", brief, priority: "NORMAL", clientId: creativeClient, briefLinks: [{ title: "x", url: "javascript:1" }] })).rejects.toThrow(/http/);
  });

  it("revision loop: reject -> new version -> approve -> deliver; wrong people are refused", async () => {
    const r = await svc.createRequest(A("boss", true), { title: "Loop", kind: "DESIGN", brief, priority: "NORMAL", clientId: creativeClient, assigneeId: ids.des, reviewerId: ids.rev });
    await expect(svc.submitVersion(A("des"), r.id, { url: "https://a.example.com/1" })).rejects.toThrow(/being worked on/); // not started
    await expect(svc.start(A("rev"), r.id)).rejects.toThrow(/assigned designer/);
    await svc.start(A("des"), r.id);
    await expect(svc.submitVersion(A("rev"), r.id, { url: "https://a.example.com/1" })).rejects.toThrow(/assigned designer/);
    const v1 = await svc.submitVersion(A("des"), r.id, { url: "https://a.example.com/1" });
    const ap1 = await prisma.approvalRequest.findFirstOrThrow({ where: { documentId: v1.id } });
    await expect(core.actOnApproval(A("des"), ap1.id, "APPROVE")).rejects.toThrow();
    await core.actOnApproval(A("rev"), ap1.id, "REJECT", "Needs the dark logo"); await after.afterDecision(ap1.id, ids.rev);
    expect((await prisma.creativeRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CHANGES_REQUESTED");
    expect((await prisma.creativeVersion.findUniqueOrThrow({ where: { id: v1.id } })).feedback).toBe("Needs the dark logo");
    await expect(svc.deliver(A("des"), r.id, "")).rejects.toThrow(/approved/);
    const v2 = await svc.submitVersion(A("des"), r.id, { url: "https://a.example.com/2" });
    expect(v2.versionNo).toBe(2);
    const ap2 = await prisma.approvalRequest.findFirstOrThrow({ where: { documentId: v2.id } });
    await core.actOnApproval(A("rev"), ap2.id, "APPROVE"); await after.afterDecision(ap2.id, ids.rev);
    await svc.deliver(A("des"), r.id, "Done");
    const done = await prisma.creativeRequest.findUniqueOrThrow({ where: { id: r.id }, include: { versions: { orderBy: { versionNo: "asc" } } } });
    expect(done.status).toBe("DELIVERED");
    expect(done.versions.map((v) => v.status)).toEqual(["CHANGES_REQUESTED", "APPROVED"]);
  });

  it("a review needs a reviewer or configured steps, and a failed approval leaves no half-submitted version", async () => {
    const r = await svc.createRequest(A("boss", true), { title: "NoRev", kind: "DESIGN", brief, priority: "NORMAL", clientId: creativeClient, assigneeId: ids.des });
    await svc.start(A("des"), r.id);
    await expect(svc.submitVersion(A("des"), r.id, { url: "https://a.example.com/1" })).rejects.toThrow(/reviewer/);
    const after_ = await prisma.creativeRequest.findUniqueOrThrow({ where: { id: r.id }, include: { versions: true } });
    expect(after_.status).toBe("IN_PROGRESS"); expect(after_.versions.length).toBe(0);
  });

  it("cancelling during review withdraws the open approval", async () => {
    const r = await svc.createRequest(A("boss", true), { title: "Cancel", kind: "DESIGN", brief, priority: "NORMAL", clientId: creativeClient, assigneeId: ids.des, reviewerId: ids.rev });
    await svc.start(A("des"), r.id);
    const v = await svc.submitVersion(A("des"), r.id, { url: "https://a.example.com/1" });
    await expect(svc.cancelRequest(A("des"), r.id)).rejects.toThrow(/cannot cancel/);
    await svc.cancelRequest(A("req"), r.id).catch(() => {}); // requester is the boss here; use boss
    await svc.cancelRequest(A("boss", true), r.id);
    expect((await prisma.creativeRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CANCELLED");
    expect((await prisma.approvalRequest.findFirstOrThrow({ where: { documentId: v.id } })).status).toBe("CANCELLED");
  });
});
