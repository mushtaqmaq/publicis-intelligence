import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Every server action, route handler and page under app/media must enforce the Media module itself
// (the layout alone is not enough: actions and routes are separate endpoints).
const ROOT = path.resolve(__dirname, "../app/media");
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f));
const GUARD = /requireMediaUser\(\)|hasModule\(/;
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
});
