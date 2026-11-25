import { describe, expect, it } from "vitest";
import { studioAccess, studioEnabled } from "../studio/flags";

describe("studio flags", () => {
  it("is off by default", () => {
    expect(studioEnabled({})).toBe(false);
    expect(studioAccess("admin", {})).toEqual({ allowed: false, reason: "disabled" });
  });

  it("allows admin and developer once enabled", () => {
    const env = { STUDIO_ENABLED: "1" };
    expect(studioAccess("admin", env).allowed).toBe(true);
    expect(studioAccess("developer", env).allowed).toBe(true);
    expect(studioAccess("buyer", env)).toEqual({ allowed: false, reason: "role" });
    expect(studioAccess(null, env)).toEqual({ allowed: false, reason: "anonymous" });
  });

  it("honours STUDIO_ROLES including the wildcard", () => {
    expect(studioAccess("buyer", { STUDIO_ENABLED: "true", STUDIO_ROLES: "buyer, admin" }).allowed).toBe(true);
    expect(studioAccess("seller", { STUDIO_ENABLED: "on", STUDIO_ROLES: "*" }).allowed).toBe(true);
    expect(studioAccess("seller", { STUDIO_ENABLED: "on", STUDIO_ROLES: "admin" }).allowed).toBe(false);
  });
});
