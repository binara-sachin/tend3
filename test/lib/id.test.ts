import { describe, expect, it } from "vitest";
import { generateId } from "../../lib/id.js";

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateId", () => {
  it("returns a UUIDv7-formatted string", () => {
    expect(generateId()).toMatch(UUID_V7_PATTERN);
  });

  it("returns a different id on each call", () => {
    expect(generateId()).not.toBe(generateId());
  });

  it("returns ids that sort ascending in generation order", () => {
    const first = generateId();
    const second = generateId();

    expect(first < second).toBe(true);
  });
});
