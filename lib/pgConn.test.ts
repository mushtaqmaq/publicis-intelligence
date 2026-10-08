import { describe, it, expect } from "vitest";
import { withExplicitSsl } from "./pgConn";

describe("withExplicitSsl", () => {
  it("rewrites the ambiguous modes to verify-full (the behaviour pg already applies)", () => {
    expect(withExplicitSsl("postgres://u:p@h/db?sslmode=require")).toBe("postgres://u:p@h/db?sslmode=verify-full");
    expect(withExplicitSsl("postgres://u:p@h/db?sslmode=prefer&x=1")).toBe("postgres://u:p@h/db?sslmode=verify-full&x=1");
    expect(withExplicitSsl("postgres://u:p@h/db?a=1&sslmode=verify-ca")).toBe("postgres://u:p@h/db?a=1&sslmode=verify-full");
  });
  it("leaves everything else untouched", () => {
    for (const u of ["postgres://u:p@h/db", "postgres://u:p@h/db?sslmode=disable", "postgres://u:p@h/db?sslmode=verify-full", "postgres://u:p@h/db?sslmode=require&uselibpqcompat=true", ""]) expect(withExplicitSsl(u)).toBe(u);
  });
});
