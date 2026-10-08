import { describe, it, expect } from "vitest";
import { resolveModules, moduleOfRoute, canUse, IDS } from "./modules";

describe("moduleOfRoute", () => {
  it("maps agent routes to their module", () => {
    expect(moduleOfRoute("media/plan")).toBe("media");
    expect(moduleOfRoute("strategy/competitor")).toBe("strategy");
    expect(moduleOfRoute("creative/image-prompt")).toBe("creative");
    expect(moduleOfRoute("multimedia/job")).toBe("multimedia");
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
    expect(moduleOfRoute("production/job")).toBeNull();
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

describe("multimedia module", () => {
  it("replaces production in the module list", () => {
    expect(IDS).toContain("multimedia");
    expect(IDS).not.toContain("production");
  });
  it("is granted through module.multimedia", () => {
    expect(resolveModules("PLANNER", [], [{ key: "module.multimedia", granted: true }])).toEqual(["multimedia"]);
    expect(resolveModules("PLANNER", [], [{ key: "module.production", granted: true }])).toEqual([]);
  });
});
