import { describe, it, expect } from "vitest";
import { resolveModules, moduleOfRoute, canUse, IDS } from "./modules";

describe("moduleOfRoute", () => {
  it("maps agent routes to their module", () => {
    expect(moduleOfRoute("media/plan")).toBe("media");
    expect(moduleOfRoute("strategy/competitor")).toBe("strategy");
    expect(moduleOfRoute("creative/image-prompt")).toBe("creative");
  });
  it("leaves shared routes ungated", () => {
    expect(moduleOfRoute("assistant")).toBeNull();
    expect(moduleOfRoute("assistant-web")).toBeNull();
    expect(moduleOfRoute("command")).toBeNull();
    expect(moduleOfRoute("")).toBeNull();
    expect(moduleOfRoute(undefined)).toBeNull();
  });
  it("does not treat unknown prefixes as modules", () => {
    expect(moduleOfRoute("hr/anything")).toBeNull();
  });
});

describe("resolveModules", () => {
  it("gives admins every module", () => {
    expect(resolveModules("SUPER_ADMIN", [], [])).toEqual(IDS);
    expect(resolveModules("ADMIN", [], [])).toEqual(IDS);
  });
  it("gives a member only what was granted", () => {
    expect(resolveModules("PLANNER", [], [{ key: "module.media", granted: true }])).toEqual(["media"]);
    expect(resolveModules("PLANNER", [], [])).toEqual([]);
  });
  it("lets an override revoke a role default", () => {
    expect(resolveModules("PLANNER", ["module.media", "module.finance"], [{ key: "module.finance", granted: false }])).toEqual(["media"]);
  });
  it("ignores non-module permissions", () => {
    expect(resolveModules("VIEWER", ["dashboard.avr.view"], [])).toEqual([]);
  });
  it("answers canUse by membership, never by guessing", () => {
    expect(canUse(["media"], "media")).toBe(true);
    expect(canUse(["media"], "strategy")).toBe(false);
  });
});
