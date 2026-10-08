import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveModules, resolveSections, sectionIds, SECTIONS, moduleOfRoute, canUse, IDS } from "./modules";

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

describe("media sections", () => {
  const all: string[] = sectionIds("media");
  it("gives admins every section", () => {
    expect(resolveSections("ADMIN", [], "media", [])).toEqual(all);
    expect(resolveSections("SUPER_ADMIN", [], "media", [{ key: "media.plans", granted: false }])).toEqual(all);
  });
  it("gives everyone with the module every section until one is switched off", () => {
    expect(resolveSections("PLANNER", ["media"], "media", [])).toEqual(all);
    expect(resolveSections("PLANNER", ["media"], "media", [{ key: "media.suppliers", granted: false }, { key: "media.settings", granted: false }]))
      .toEqual(all.filter((x) => x !== "suppliers" && x !== "settings"));
  });
  it("gives nothing without the module, and ignores grants that do not remove anything", () => {
    expect(resolveSections("PLANNER", ["strategy"], "media", [])).toEqual([]);
    expect(resolveSections("PLANNER", ["media"], "media", [{ key: "media.plans", granted: true }])).toEqual(all);
  });
  it("lets a person be left with exactly the sections an admin ticked", () => {
    const keep = ["plans", "inventory"];
    const off = all.filter((x) => !keep.includes(x)).map((x) => ({ key: `media.${x}`, granted: false }));
    expect(resolveSections("PLANNER", ["media"], "media", off)).toEqual(keep);
  });
  it("matches the section list the admin screen shows", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../public/js/agents.js"), "utf8");
    const m = /PI\.SECTIONS = (\{.*\});/.exec(src);
    expect(m).not.toBeNull();
    expect(eval("(" + m![1] + ")")).toEqual(SECTIONS);
  });
  it("has a seeded permission row for every section", () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20261008130000_media_section_permissions/migration.sql"), "utf8");
    for (const id of all) expect(sql).toContain(`'media.${id}'`);
  });
});
