import { describe, it, expect } from "vitest";
import { planImport, ALL_MODULES } from "../scripts/importSpaceLib.mjs";

const rows = {
  users: [
    { id: "a1", email: "Admin@Example.com", name: "A", pass: "scrypt$x$y", role: "admin", credits: 10, active: 1, created_at: 1000 },
    { id: "m1", email: "m1@example.com", name: "M", pass: "scrypt$x$y", role: "member", credits: 5, active: 0, created_at: 2000 },
    { id: "m2", email: "EXISTING@example.com", name: "E", pass: "scrypt$x$y", role: "member", credits: 7, active: 1, created_at: 3000 },
    { id: "m3", email: "", name: "NoEmail", pass: "p", role: "member", credits: 0, active: 1, created_at: 1 },
  ],
  ledger: [{ user_id: "m1", ts: 1, kind: "topup", credits: 5, balance_after: 5 }, { user_id: "m2", ts: 2, kind: "usage", credits: -1, balance_after: 6 }],
  docs: [{ col: "clients", id: "c1", owner: "m1", data: "{}", updated_at: 5 }, { col: "clients", id: "c2", owner: "ghost", data: "{}", updated_at: 6 }],
  conversations: [{ id: "cv1", user_id: "m2", title: "t", messages: "[]", updated_at: 1 }, { id: "cv2", user_id: "unknown", title: "t", messages: "[]", updated_at: 1 }],
  settings: [{ key: "app3", value: "{}" }, { key: "other", value: "1" }],
  files: [{ id: "f1", owner: "m1", name: "x.png", mime: "image/png", size: 1, kind: "image", created_at: 1 }],
};
const existing = { users: [{ id: "u9", email: "existing@example.com" }], settingKeys: ["app3"] };

describe("planImport", () => {
  const p = planImport(rows, existing);
  it("creates new users with mapped roles, lower-cased emails and the planner password format kept as-is", () => {
    expect(p.newUsers.map((u: { email: string; role: string }) => [u.email, u.role])).toEqual([["admin@example.com", "ADMIN"], ["m1@example.com", "PLANNER"]]);
    expect(p.newUsers[1].active).toBe(false);
    expect(p.newUsers[0].passwordHash).toBe("scrypt$x$y");
  });
  it("gives members every module (admins hold all implicitly) and honours a narrower list", () => {
    expect(p.newUsers[1].modules).toEqual(ALL_MODULES); expect(p.newUsers[0].modules).toEqual([]);
    expect(planImport(rows, existing, { modules: ["media"] }).newUsers[1].modules).toEqual(["media"]);
  });
  it("never touches an existing user, and skips rows with no email", () => {
    expect(p.skippedUsers.map((s: { reason: string }) => s.reason)).toEqual(["already exists (left untouched)", "no email"]);
  });
  it("imports ledger rows only for newly created users", () => {
    expect(p.ledger.length).toBe(1); expect(p.ledger[0].user_id).toBe("m1");
  });
  it("keeps an existing user's conversations by pointing them at the existing account, and drops orphans", () => {
    expect(p.conversations.map((c: { id: string; userId: string }) => [c.id, c.userId])).toEqual([["cv1", "u9"]]);
  });
  it("does not overwrite existing settings", () => {
    expect(p.settings.map((s: { key: string }) => s.key)).toEqual(["other"]);
  });
  it("maps document owners and nulls unknown owners instead of failing", () => {
    expect(p.docs.map((d: { owner: string | null }) => d.owner)).toEqual(["m1", null]);
  });
  it("renames an id that would collide with an existing user id", () => {
    const q = planImport({ users: [{ id: "u9", email: "new@example.com", pass: "p", role: "member", credits: 0, active: 1, created_at: 1 }] }, existing);
    expect(q.newUsers[0].id).toBe("u9_sp");
  });
});
