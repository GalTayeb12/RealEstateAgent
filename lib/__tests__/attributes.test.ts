/**
 * Run with: npx tsx lib/__tests__/attributes.test.ts
 */
import { describe, it, expect } from "vitest";
import { formatAttributeValue, parseAttributes } from "../attributes";

const rooms = { bedrooms: 2, bathrooms: 2, sqft: 850 };

describe("parseAttributes", () => {
  it("object", () => { expect(parseAttributes(rooms)).toEqual(rooms); });
  it("one encoding", () => { expect(parseAttributes(JSON.stringify(rooms))).toEqual(rooms); });
  it("double encoding", () => { expect(parseAttributes(JSON.stringify(JSON.stringify(rooms)))).toEqual(rooms); });
  it("empty string", () => { expect(parseAttributes("")).toEqual({}); });
  it("invalid", () => { expect(parseAttributes("{")).toEqual({}); });
  it("array", () => { expect(parseAttributes("[1,2]")).toEqual({}); });
  it("null", () => { expect(parseAttributes(null)).toEqual({}); });
});

describe("formatAttributeValue", () => {
  it("number value", () => { expect(formatAttributeValue(2)).toBe("2"); });
  it("empty value", () => { expect(formatAttributeValue("")).toBe(""); });
});
