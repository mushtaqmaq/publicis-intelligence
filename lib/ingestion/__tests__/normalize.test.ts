import { describe, it, expect } from "vitest";
import { classifyMoneyStatus, parseDurationLabel } from "../normalize";

describe("classifyMoneyStatus", () => {
  it("classifies a known numeric value", () => {
    expect(classifyMoneyStatus("QAR 120,000")).toBe("KNOWN");
    expect(classifyMoneyStatus("155000")).toBe("KNOWN");
  });

  it("never treats TBD as zero / KNOWN", () => {
    expect(classifyMoneyStatus("TBD")).toBe("TBD");
    expect(classifyMoneyStatus("tbd")).toBe("TBD");
  });

  it("recognizes POA, On Request, N/A, To Be Confirmed", () => {
    expect(classifyMoneyStatus("POA")).toBe("POA");
    expect(classifyMoneyStatus("On Request")).toBe("ON_REQUEST");
    expect(classifyMoneyStatus("N/A")).toBe("NOT_APPLICABLE");
    expect(classifyMoneyStatus("To be confirmed")).toBe("TO_BE_CONFIRMED");
  });

  it("treats blank/missing as NOT_APPLICABLE, never KNOWN zero", () => {
    expect(classifyMoneyStatus(null)).toBe("NOT_APPLICABLE");
    expect(classifyMoneyStatus("")).toBe("NOT_APPLICABLE");
    expect(classifyMoneyStatus("   ")).toBe("NOT_APPLICABLE");
  });
});

describe("parseDurationLabel", () => {
  it("parses common duration shapes", () => {
    expect(parseDurationLabel("2 weeks")).toEqual({ value: 2, unit: "weeks" });
    expect(parseDurationLabel("4 Weeks")).toEqual({ value: 4, unit: "weeks" });
    expect(parseDurationLabel("3 months")).toEqual({ value: 3, unit: "months" });
    expect(parseDurationLabel("12months")).toEqual({ value: 12, unit: "months" });
  });

  it("returns null instead of guessing on unrecognized text", () => {
    expect(parseDurationLabel("Flexible")).toBeNull();
    expect(parseDurationLabel(null)).toBeNull();
  });
});
