import { describe, it, expect } from "vitest";
import * as w from "./workflow";

const base = { requestedById: "req", assigneeId: "des", reviewerId: "rev" };
const r = (status: w.CStatus, over: Partial<w.Req> = {}): w.Req => ({ ...base, status, ...over });
const me = (id: string, manager = false): w.Who => ({ id, manager });

describe("creative workflow", () => {
  it("assignment: requester or manager, designer required, reviewer must differ", () => {
    expect(w.canAssign(r("NEW"), me("req"))).toBe(true);
    expect(w.canAssign(r("NEW"), me("boss", true))).toBe(true);
    expect(w.canAssign(r("NEW"), me("random"))).toBe(false);
    expect(w.canAssign(r("DELIVERED"), me("boss", true))).toBe(false);
    expect(() => w.checkAssignment(null, null)).toThrow(/designer/);
    expect(() => w.checkAssignment("a", "a")).toThrow(/other than the designer/);
    expect(() => w.checkAssignment("a", "b")).not.toThrow();
    expect(w.statusAfterAssign("NEW")).toBe("ASSIGNED");
    expect(w.statusAfterAssign("IN_PROGRESS")).toBe("IN_PROGRESS"); // reassigning does not rewind work
  });
  it("only the designer starts and submits, only at the right stage", () => {
    expect(w.canStart(r("ASSIGNED"), me("des"))).toBe(true);
    expect(w.canStart(r("ASSIGNED"), me("req", true))).toBe(false);
    expect(w.canStart(r("IN_PROGRESS"), me("des"))).toBe(false);
    expect(w.canSubmit(r("IN_PROGRESS"), me("des"))).toBe(true);
    expect(w.canSubmit(r("CHANGES_REQUESTED"), me("des"))).toBe(true);
    expect(w.canSubmit(r("IN_REVIEW"), me("des"))).toBe(false);
    expect(w.canSubmit(r("IN_PROGRESS"), me("rev"))).toBe(false);
  });
  it("delivery needs approval first", () => {
    expect(w.canDeliver(r("IN_REVIEW"), me("des"))).toBe(false);
    expect(w.canDeliver(r("APPROVED"), me("des"))).toBe(true);
    expect(w.canDeliver(r("APPROVED"), me("stranger"))).toBe(false);
  });
  it("cancel: requester or manager, never after delivery", () => {
    expect(w.canCancel(r("IN_PROGRESS"), me("req"))).toBe(true);
    expect(w.canCancel(r("IN_PROGRESS"), me("des"))).toBe(false);
    expect(w.canCancel(r("DELIVERED"), me("req", true))).toBe(false);
  });
  it("a review needs approval steps or a reviewer", () => {
    expect(() => w.needsReviewer(false, null)).toThrow(/reviewer/);
    expect(() => w.needsReviewer(true, null)).not.toThrow();
    expect(() => w.needsReviewer(false, "rev")).not.toThrow();
  });
  it("versions count up and review outcomes map to statuses", () => {
    expect(w.nextVersionNo([])).toBe(1);
    expect(w.nextVersionNo([1, 2, 3])).toBe(4);
    expect(w.afterReview("APPROVED")).toEqual({ request: "APPROVED", version: "APPROVED" });
    expect(w.afterReview("REJECTED")).toEqual({ request: "CHANGES_REQUESTED", version: "CHANGES_REQUESTED" });
  });
  it("overdue only while work is still open", () => {
    const past = new Date(Date.now() - 864e5);
    expect(w.isOverdue(past, "IN_PROGRESS")).toBe(true);
    expect(w.isOverdue(past, "APPROVED")).toBe(false);
    expect(w.isOverdue(past, "DELIVERED")).toBe(false);
    expect(w.isOverdue(null, "NEW")).toBe(false);
  });
});
