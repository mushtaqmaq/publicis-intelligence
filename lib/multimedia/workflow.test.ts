import { describe, it, expect } from "vitest";
import * as w from "./workflow";

const j = (status: w.MStatus, over: Partial<w.Job> = {}): w.Job => ({ status, requestedById: "req", producerId: "prod", reviewerId: "rev", ...over });
const me = (id: string, manager = false): w.Who => ({ id, manager });
const slot = (a: string, b: string) => ({ startsAt: new Date(a), endsAt: new Date(b) });

describe("multimedia workflow", () => {
  it("planning: producer, requester or manager, never once closed", () => {
    expect(w.canPlan(j("PLANNED"), me("prod"))).toBe(true);
    expect(w.canPlan(j("PLANNED"), me("req"))).toBe(true);
    expect(w.canPlan(j("PLANNED"), me("boss", true))).toBe(true);
    expect(w.canPlan(j("PLANNED"), me("random"))).toBe(false);
    expect(w.canPlan(j("DELIVERED"), me("boss", true))).toBe(false);
    expect(w.canSchedule(j("IN_PROGRESS"), me("prod"))).toBe(false);
  });
  it("start, submit and deliver belong to the producer (or a manager)", () => {
    expect(w.canStart(j("SCHEDULED"), me("prod"))).toBe(true);
    expect(w.canStart(j("PLANNED"), me("prod"))).toBe(false);
    expect(w.canStart(j("SCHEDULED"), me("req"))).toBe(false);
    expect(w.canSubmit(j("IN_PROGRESS"), me("prod"))).toBe(true);
    expect(w.canSubmit(j("CHANGES_REQUESTED"), me("prod"))).toBe(true);
    expect(w.canSubmit(j("IN_REVIEW"), me("prod"))).toBe(false);
    expect(w.canDeliver(j("IN_REVIEW"), me("prod"))).toBe(false);
    expect(w.canDeliver(j("APPROVED"), me("prod"))).toBe(true);
    expect(w.canDeliver(j("APPROVED"), me("req"))).toBe(false);
  });
  it("cancel not after delivery", () => {
    expect(w.canCancel(j("SCHEDULED"), me("req"))).toBe(true);
    expect(w.canCancel(j("SCHEDULED"), me("other"))).toBe(false);
    expect(w.canCancel(j("DELIVERED"), me("boss", true))).toBe(false);
  });
  it("producer/reviewer rules", () => {
    expect(() => w.checkProducer(null, "a")).toThrow(/producer/);
    expect(() => w.checkProducer("a", "a")).toThrow(/other than/);
    expect(() => w.checkProducer("a", "b")).not.toThrow();
    expect(() => w.needsReviewer(false, null)).toThrow(/reviewer/);
    expect(() => w.needsReviewer(true, null)).not.toThrow();
  });
  it("review outcomes", () => {
    expect(w.afterReview("APPROVED").job).toBe("APPROVED");
    expect(w.afterReview("REJECTED")).toEqual({ job: "CHANGES_REQUESTED", version: "CHANGES_REQUESTED" });
    expect(w.nextVersionNo([1, 2])).toBe(3);
  });
  it("slots must be valid", () => {
    expect(() => w.checkSlot(slot("2027-03-01T09:00Z", "2027-03-01T17:00Z"))).not.toThrow();
    expect(() => w.checkSlot(slot("2027-03-01T17:00Z", "2027-03-01T09:00Z"))).toThrow(/after the start/);
    expect(() => w.checkSlot(slot("2027-03-01T09:00Z", "2027-03-01T09:00Z"))).toThrow(/after the start/);
    expect(() => w.checkSlot({ startsAt: new Date("x"), endsAt: new Date() })).toThrow(/start and an end/);
    expect(() => w.checkSlot(slot("2027-03-01T00:00Z", "2027-05-01T00:00Z"))).toThrow(/31 days/);
  });
  it("detects double-booking but allows back-to-back", () => {
    const booked = [slot("2027-03-01T09:00Z", "2027-03-01T13:00Z"), slot("2027-03-02T09:00Z", "2027-03-02T13:00Z")];
    expect(w.findConflicts(slot("2027-03-01T12:00Z", "2027-03-01T15:00Z"), booked)).toHaveLength(1);
    expect(w.findConflicts(slot("2027-03-01T13:00Z", "2027-03-01T15:00Z"), booked)).toHaveLength(0);
    expect(w.findConflicts(slot("2027-03-01T07:00Z", "2027-03-01T09:00Z"), booked)).toHaveLength(0);
    expect(w.findConflicts(slot("2027-03-01T08:00Z", "2027-03-03T00:00Z"), booked)).toHaveLength(2);
    expect(w.findConflicts(slot("2027-03-01T10:00Z", "2027-03-01T11:00Z"), booked)).toHaveLength(1); // fully inside
  });
  it("task progress", () => {
    expect(w.taskProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
    expect(w.taskProgress([{ status: "DONE" }, { status: "TODO" }, { status: "DONE" }, { status: "BLOCKED" }])).toEqual({ done: 2, total: 4, pct: 50 });
  });
  it("overdue only while work is open", () => {
    const past = new Date(Date.now() - 864e5);
    expect(w.isOverdue(past, "SCHEDULED")).toBe(true);
    expect(w.isOverdue(past, "APPROVED")).toBe(false);
  });
});
