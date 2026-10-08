import { describe, it, expect } from "vitest";
import { validateLinkUrl } from "./links";
import { formatNumber } from "./sequence";
import { ApprovalError, buildSteps, cancel, canAct, currentStep, decide, type Actor } from "./approvals";

const maker: Actor = { id: "maker", role: "PLANNER" };
const manager: Actor = { id: "mgr", role: "ACCOUNT_MANAGER" };
const finance: Actor = { id: "fin", role: "ADMIN" };
const defs = [{ label: "Manager", approverUserId: "mgr" }, { label: "Finance", approverUserId: "fin" }, { label: "Director", approverRole: "SUPER_ADMIN" as const, minAmount: 50000 }];

describe("link validation (links only, no files)", () => {
  it("accepts http and https links and normalises them", () => {
    expect(validateLinkUrl(" https://drive.google.com/file/d/abc/view ")).toEqual({ ok: true, url: "https://drive.google.com/file/d/abc/view" });
    expect(validateLinkUrl("http://intranet.local/briefs/1").ok).toBe(true);
  });
  it("rejects anything that could run code or read a local file", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "ftp://x.com/a", "//evil.com", "not a url", "", "   "]) expect(validateLinkUrl(bad).ok).toBe(false);
  });
  it("rejects embedded credentials and overlong links", () => {
    expect(validateLinkUrl("https://user:pw@example.com/a").ok).toBe(false);
    expect(validateLinkUrl("https://example.com/" + "a".repeat(2100)).ok).toBe(false);
  });
});

describe("document numbers", () => {
  it("pads", () => { expect(formatNumber("CMP", 7)).toBe("CMP-0007"); expect(formatNumber("INV", 12345)).toBe("INV-12345"); });
});

describe("approval steps", () => {
  it("applies amount bands and numbers the steps from 1", () => {
    expect(buildSteps(defs, 1000, "maker").map((s) => s.label)).toEqual(["Manager", "Finance"]);
    const big = buildSteps(defs, 60000, "maker");
    expect(big.map((s) => [s.stepOrder, s.label, s.status])).toEqual([[1, "Manager", "PENDING"], [2, "Finance", "WAITING"], [3, "Director", "WAITING"]]);
  });
  it("refuses a step that has no approver, or none at all", () => {
    expect(() => buildSteps([{ label: "X" }], 1, "maker")).toThrow(ApprovalError);
    expect(() => buildSteps([], 1, "maker")).toThrow(ApprovalError);
  });
  it("refuses to make the requester their own approver", () => {
    expect(() => buildSteps([{ label: "Me", approverUserId: "maker" }], 1, "maker")).toThrow(/own request/);
  });
});

describe("approval decisions", () => {
  const start = () => buildSteps(defs, 60000, "maker");
  it("moves step by step to approved, in order", () => {
    let s = start();
    expect(() => decide(s, "PENDING", "APPROVE", finance, "maker")).toThrow(/assigned to someone else/); // finance cannot jump the queue
    let d = decide(s, "PENDING", "APPROVE", manager, "maker");
    expect(d.status).toBe("PENDING"); expect(currentStep(d.steps)!.label).toBe("Finance");
    d = decide(d.steps, d.status, "APPROVE", finance, "maker");
    expect(currentStep(d.steps)!.label).toBe("Director");
    d = decide(d.steps, d.status, "APPROVE", { id: "boss", role: "SUPER_ADMIN" }, "maker");
    expect(d.status).toBe("APPROVED"); expect(d.steps.every((x) => x.status === "APPROVED")).toBe(true);
  });
  it("a rejection needs a reason and ends the request", () => {
    const s = start();
    expect(() => decide(s, "PENDING", "REJECT", manager, "maker", "  ")).toThrow(/reason/);
    const d = decide(s, "PENDING", "REJECT", manager, "maker", "Budget too high");
    expect(d.status).toBe("REJECTED"); expect(d.steps.map((x) => x.status)).toEqual(["REJECTED", "SKIPPED", "SKIPPED"]);
  });
  it("nobody approves their own request, even when assigned by role", () => {
    const s = buildSteps([{ label: "Any planner", approverRole: "PLANNER" }], 1, "maker");
    expect(() => decide(s, "PENDING", "APPROVE", maker, "maker")).toThrow(/own request/);
    expect(decide(s, "PENDING", "APPROVE", { id: "other", role: "PLANNER" }, "maker").status).toBe("APPROVED");
  });
  it("closed requests cannot be changed", () => {
    const d = decide(buildSteps(defs, 1, "maker"), "PENDING", "REJECT", manager, "maker", "no");
    expect(() => decide(d.steps, d.status, "APPROVE", finance, "maker")).toThrow(/closed/);
    expect(() => cancel(d.steps, d.status, maker, "maker")).toThrow(/closed/);
  });
  it("only the requester or an admin can cancel", () => {
    const s = start();
    expect(() => cancel(s, "PENDING", manager, "maker")).toThrow(/Only the person/);
    expect(cancel(s, "PENDING", maker, "maker").status).toBe("CANCELLED");
    expect(cancel(s, "PENDING", finance, "maker").steps.every((x) => x.status === "SKIPPED")).toBe(true);
  });
  it("canAct is false for waiting steps", () => {
    const s = start();
    expect(canAct(s[1], finance, "maker")).toBe(false);
    expect(canAct(s[0], manager, "maker")).toBe(true);
  });
});
