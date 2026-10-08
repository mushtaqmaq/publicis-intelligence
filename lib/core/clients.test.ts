import { describe, it, expect } from "vitest";
import { cleanDepartments, handles, departmentLabels } from "./clients";

describe("client departments", () => {
  it("keeps known departments once, in standard order, and drops the rest", () => {
    expect(cleanDepartments(["media", "creative", "media", "hr", "multimedia"])).toEqual(["creative", "media", "multimedia"]);
    expect(cleanDepartments(undefined)).toEqual([]);
    expect(cleanDepartments("media")).toEqual([]);
  });
  it("McDonald's by three departments, Talabat by Media only", () => {
    const mcd = { departments: cleanDepartments(["creative", "media", "multimedia"]) };
    const talabat = { departments: cleanDepartments(["media"]) };
    expect(handles(mcd, "creative") && handles(mcd, "multimedia") && handles(mcd, "media")).toBe(true);
    expect(handles(talabat, "media")).toBe(true);
    expect(handles(talabat, "creative")).toBe(false);
    expect(departmentLabels(mcd.departments)).toEqual(["Creative", "Media", "Multimedia"]);
  });
});
