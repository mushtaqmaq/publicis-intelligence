import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Runs only against a throwaway database: TEST_DATABASE_URL=postgresql://... npx vitest run lib/multimedia
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("multimedia against a real database", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let core: typeof import("@/lib/core/service");
  let after: typeof import("@/lib/core/afterDecision");
  const tag = `mm${Date.now()}`;
  const ids = { req: `${tag}-req`, prod: `${tag}-prod`, rev: `${tag}-rev`, boss: `${tag}-boss`, crew: `${tag}-crew` };
  let mmClient = "", artClient = "", resId = "", res2Id = "";
  const A = (k: keyof typeof ids, manager = false) => ({ id: ids[k], role: (k === "rev" ? "ACCOUNT_MANAGER" : k === "boss" ? "ADMIN" : "PLANNER") as never, manager });
  const brief = "A short but real brief for the crew.";
  const t = (h: number) => new Date(Date.UTC(2027, 5, 1, h));

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    svc = await import("./service"); core = await import("@/lib/core/service"); after = await import("@/lib/core/afterDecision");
    for (const [k, id] of Object.entries(ids)) await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x", role: k === "rev" ? "ACCOUNT_MANAGER" : k === "boss" ? "ADMIN" : "PLANNER" } });
    mmClient = (await prisma.client.create({ data: { name: `MM ${tag}`, departments: ["multimedia"] } })).id;
    artClient = (await prisma.client.create({ data: { name: `ART ${tag}`, departments: ["creative"] } })).id;
    resId = (await svc.createResource(A("boss", true), { name: `Camera ${tag}`, kind: "EQUIPMENT" })).id;
    res2Id = (await svc.createResource(A("boss", true), { name: `Studio ${tag}`, kind: "STUDIO" })).id;
  });
  afterAll(async () => {
    const jobs = await prisma.multimediaJob.findMany({ where: { clientId: { in: [mmClient, artClient] } }, select: { id: true } });
    const vers = await prisma.multimediaVersion.findMany({ where: { jobId: { in: jobs.map((j) => j.id) } }, select: { id: true } });
    await prisma.approvalRequest.deleteMany({ where: { documentId: { in: vers.map((v) => v.id) } } });
    await prisma.link.deleteMany({ where: { entityId: { in: jobs.map((j) => j.id) } } });
    await prisma.multimediaJob.deleteMany({ where: { clientId: { in: [mmClient, artClient] } } });
    await prisma.resource.deleteMany({ where: { id: { in: [resId, res2Id] } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await prisma.client.deleteMany({ where: { id: { in: [mmClient, artClient] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  const mk = (title: string, over = {}) => svc.createJob(A("boss", true), { title, jobType: "VIDEO_SHOOT", brief, clientId: mmClient, producerId: ids.prod, reviewerId: ids.rev, ...over });

  it("only accepts clients that Multimedia handles; numbers jobs", async () => {
    await expect(svc.createJob(A("req"), { title: "x", jobType: "VIDEO_SHOOT", brief, clientId: artClient })).rejects.toThrow(/not handled by Multimedia/);
    const j = await mk("Numbered");
    expect(j.code).toMatch(/^MMJ-\d{4,}$/);
    await expect(mk("Bad", { producerId: ids.prod, reviewerId: ids.prod })).rejects.toThrow(/other than the producer/);
  });

  it("never double-books a resource, even with simultaneous requests", async () => {
    const a = await mk("A"), b = await mk("B");
    await svc.bookResource(A("boss", true), a.id, { resourceId: resId, startsAt: t(9), endsAt: t(13) });
    await expect(svc.bookResource(A("boss", true), b.id, { resourceId: resId, startsAt: t(12), endsAt: t(15) })).rejects.toThrow(/already booked/);
    await svc.bookResource(A("boss", true), b.id, { resourceId: resId, startsAt: t(13), endsAt: t(15) }); // back-to-back is fine
    await svc.bookResource(A("boss", true), b.id, { resourceId: res2Id, startsAt: t(9), endsAt: t(13) }); // other resource is fine
    // 8 people try to take the same free slot at once: exactly one wins
    const jobs = await Promise.all(Array.from({ length: 8 }, (_, i) => mk(`Race${i}`)));
    const results = await Promise.allSettled(jobs.map((j) => svc.bookResource(A("boss", true), j.id, { resourceId: resId, startsAt: t(18), endsAt: t(20) })));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(await prisma.resourceBooking.count({ where: { resourceId: resId, startsAt: t(18) } })).toBe(1);
  });

  it("a cancelled job frees its resources; disabled resources cannot be booked; only managers add resources", async () => {
    const j = await mk("Cancel me");
    await svc.bookResource(A("boss", true), j.id, { resourceId: res2Id, startsAt: t(20), endsAt: t(22) });
    await svc.cancelJob(A("boss", true), j.id);
    const k = await mk("After cancel");
    await svc.bookResource(A("boss", true), k.id, { resourceId: res2Id, startsAt: t(20), endsAt: t(22) });
    await svc.setResourceActive(A("boss", true), res2Id, false);
    await expect(svc.bookResource(A("boss", true), k.id, { resourceId: res2Id, startsAt: t(1), endsAt: t(2) })).rejects.toThrow(/not available/);
    await svc.setResourceActive(A("boss", true), res2Id, true);
    await expect(svc.createResource(A("req"), { name: "Nope", kind: "CREW" })).rejects.toThrow(/manager/);
    await expect(svc.bookResource(A("crew"), k.id, { resourceId: resId, startsAt: t(1), endsAt: t(2) })).rejects.toThrow(/cannot book/);
  });

  it("tasks: assignee or planner updates them; progress counts", async () => {
    const j = await mk("Tasks");
    const task = await svc.addTask(A("prod"), j.id, { title: "Location recce", assigneeId: ids.crew });
    await expect(svc.setTaskStatus(A("req"), task.id, "DONE")).rejects.toThrow(); // requester may plan, so use a stranger below
    const stranger = { id: "nobody", role: "PLANNER" as never, manager: false };
    await expect(svc.setTaskStatus(stranger, task.id, "DONE")).rejects.toThrow(/Only the assignee/);
    await svc.setTaskStatus(A("crew"), task.id, "DONE");
    expect((await prisma.multimediaTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
    await expect(svc.setTaskStatus(A("crew"), task.id, "FLYING")).rejects.toThrow(/Unknown/);
  });

  it("full flow: schedule -> start -> submit -> reject -> resubmit -> approve -> deliver", async () => {
    const j = await mk("Flow");
    await expect(svc.start(A("prod"), j.id)).rejects.toThrow(/scheduled/);
    await expect(svc.schedule(A("prod"), j.id, { startsAt: t(10), endsAt: t(9) })).rejects.toThrow(/after the start/);
    await svc.schedule(A("prod"), j.id, { startsAt: t(9), endsAt: t(17), location: "Doha studio" });
    await svc.start(A("prod"), j.id);
    const v1 = await svc.submitVersion(A("prod"), j.id, { url: "https://cloud.example.com/cut1" });
    const ap1 = await prisma.approvalRequest.findFirstOrThrow({ where: { documentId: v1.id } });
    await expect(core.actOnApproval(A("prod"), ap1.id, "APPROVE")).rejects.toThrow();
    await core.actOnApproval(A("rev"), ap1.id, "REJECT", "Colour grade too warm"); await after.afterDecision(ap1.id, ids.rev);
    expect((await prisma.multimediaJob.findUniqueOrThrow({ where: { id: j.id } })).status).toBe("CHANGES_REQUESTED");
    await expect(svc.deliver(A("prod"), j.id, "")).rejects.toThrow(/approved/);
    const v2 = await svc.submitVersion(A("prod"), j.id, { url: "https://cloud.example.com/cut2" });
    const ap2 = await prisma.approvalRequest.findFirstOrThrow({ where: { documentId: v2.id } });
    await core.actOnApproval(A("rev"), ap2.id, "APPROVE"); await after.afterDecision(ap2.id, ids.rev);
    await svc.deliver(A("prod"), j.id, "Final in the shared drive");
    const done = await prisma.multimediaJob.findUniqueOrThrow({ where: { id: j.id }, include: { versions: { orderBy: { versionNo: "asc" } } } });
    expect(done.status).toBe("DELIVERED");
    expect(done.versions.map((v) => v.status)).toEqual(["CHANGES_REQUESTED", "APPROVED"]);
    expect(done.versions[0].feedback).toBe("Colour grade too warm");
  });

  it("a failed approval hand-in leaves no half-submitted version", async () => {
    const j = await svc.createJob(A("boss", true), { title: "NoRev", jobType: "EDITING", brief, clientId: mmClient, producerId: ids.prod });
    await svc.schedule(A("prod"), j.id, { startsAt: t(9), endsAt: t(10) }); await svc.start(A("prod"), j.id);
    await expect(svc.submitVersion(A("prod"), j.id, { url: "https://c.example.com/1" })).rejects.toThrow(/reviewer/);
    const after_ = await prisma.multimediaJob.findUniqueOrThrow({ where: { id: j.id }, include: { versions: true } });
    expect(after_.status).toBe("IN_PROGRESS"); expect(after_.versions.length).toBe(0);
  });
});
