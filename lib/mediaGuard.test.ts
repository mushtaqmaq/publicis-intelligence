import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Every server action, route handler and page under app/media must enforce the Media module itself
// (the layout alone is not enough: actions and routes are separate endpoints).
const ROOT = path.resolve(__dirname, "../app/media");
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f));
const GUARD = /requireMediaUser\(\s*(?:"[a-z]+"|null)\s*\)|hasSection\(/;
const rel = (f: string) => path.relative(path.resolve(__dirname, ".."), f);

describe("Media module guard coverage", () => {
  it("covers every server action file", () => {
    const missing = files.filter((f) => /^\s*["']use server["']/m.test(fs.readFileSync(f, "utf8"))).filter((f) => !GUARD.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(missing).toEqual([]);
  });
  it("covers every route handler", () => {
    const missing = files.filter((f) => path.basename(f) === "route.ts").filter((f) => !GUARD.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(missing).toEqual([]);
  });
  it("covers every page (except the root redirect)", () => {
    const missing = files.filter((f) => path.basename(f) === "page.tsx" && rel(f) !== path.join("app", "media", "page.tsx")).filter((f) => !GUARD.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(missing).toEqual([]);
  });
  it("finds the files it is supposed to check (guards against a silently empty scan)", () => {
    expect(files.filter((f) => path.basename(f) === "page.tsx").length).toBeGreaterThan(20);
    expect(files.filter((f) => /\.(ts)$/.test(f) && /^\s*["']use server["']/m.test(fs.readFileSync(f, "utf8"))).length).toBeGreaterThan(8);
  });
  it("guards each file with the section of the folder it lives in", () => {
    const wrong = files.flatMap((f) => {
      const section = path.relative(ROOT, f).split(path.sep)[0];
      if (!/^(dashboard|plans|inventory|map|suppliers|reports|clients|settings)$/.test(section)) return [];
      const text = fs.readFileSync(f, "utf8");
      const used = [...text.matchAll(/requireMediaUser\("([a-z]+)"\)|hasSection\(\w+, "media", "([a-z]+)"\)/g)].map((m) => m[1] ?? m[2]);
      return used.filter((u) => u !== section).map((u) => `${rel(f)} uses "${u}" but lives in ${section}`);
    });
    expect(wrong).toEqual([]);
  });
});

// Campaigns and approvals belong to no single module, so each file must call requirePlatformUser (signed in + a working module).
describe("Platform pages (campaigns, approvals) guard coverage", () => {
  const roots = ["campaigns", "approvals"].map((d) => path.resolve(__dirname, "../app", d));
  const pf = roots.flatMap((r) => walk(r)).filter((f) => /\.(ts|tsx)$/.test(f));
  const G = /requirePlatformUser\(/;
  it("covers every page, server action file and route", () => {
    const need = pf.filter((f) => path.basename(f) === "page.tsx" || path.basename(f) === "route.ts" || /^\s*["']use server["']/m.test(fs.readFileSync(f, "utf8")));
    expect(need.length).toBeGreaterThan(5);
    expect(need.filter((f) => !G.test(fs.readFileSync(f, "utf8"))).map(rel)).toEqual([]);
  });
  it("only admins reach the approval settings", () => {
    const f = pf.find((x) => x.endsWith(path.join("settings", "page.tsx")))!;
    expect(fs.readFileSync(f, "utf8")).toMatch(/requirePlatformUser\(\{ admin: true \}\)/);
    const a = fs.readFileSync(pf.find((x) => x.endsWith(path.join("approvals", "actions.ts")))!, "utf8");
    expect(a).toMatch(/saveTemplateAction[\s\S]*requirePlatformUser\(\{ admin: true \}\)/);
  });
});

describe("Creative module guard coverage", () => {
  const cf = walk(path.resolve(__dirname, "../app/creative")).filter((f) => /\.(ts|tsx)$/.test(f));
  const need = cf.filter((f) => path.basename(f) === "page.tsx" || path.basename(f) === "route.ts" || /^\s*["']use server["']/m.test(fs.readFileSync(f, "utf8")));
  it("every page, action file and route requires the Creative module", () => {
    expect(need.length).toBeGreaterThan(4);
    expect(need.filter((f) => !/requireCreativeUser\(/.test(fs.readFileSync(f, "utf8"))).map(rel)).toEqual([]);
  });
  it("every exported action calls the guard itself", () => {
    const bad: string[] = [];
    for (const f of need.filter((x) => path.basename(x) === "actions.ts")) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(/export async function (\w+)\([^)]*\)\s*\{([\s\S]*?)\n\}/g)) if (!/requireCreativeUser\(/.test(m[2])) bad.push(`${rel(f)}:${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("Multimedia module guard coverage", () => {
  const mf = walk(path.resolve(__dirname, "../app/multimedia")).filter((f) => /\.(ts|tsx)$/.test(f));
  const need = mf.filter((f) => path.basename(f) === "page.tsx" || path.basename(f) === "route.ts" || /^\s*["']use server["']/m.test(fs.readFileSync(f, "utf8")));
  it("every page, action file and route requires the Multimedia module", () => {
    expect(need.length).toBeGreaterThan(6);
    expect(need.filter((f) => !/requireMultimediaUser\(/.test(fs.readFileSync(f, "utf8"))).map(rel)).toEqual([]);
  });
  it("every exported action calls the guard itself", () => {
    const bad: string[] = [];
    for (const f of need.filter((x) => path.basename(x) === "actions.ts")) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(/export async function (\w+)\([^)]*\)\s*\{([\s\S]*?)\n\}/g)) if (!/requireMultimediaUser\(/.test(m[2])) bad.push(`${rel(f)}:${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
});
