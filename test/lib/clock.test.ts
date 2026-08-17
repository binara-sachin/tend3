import { describe, expect, it } from "vitest";
import { fixedClock, systemClock } from "../../lib/clock.js";

describe("systemClock", () => {
  it("returns an ISO 8601 timestamp close to now", () => {
    const before = Date.now();
    const iso = systemClock();
    const after = Date.now();

    const parsed = Date.parse(iso);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

describe("fixedClock", () => {
  it("always returns the timestamp it was built with", () => {
    const clock = fixedClock("2020-01-01T00:00:00.000Z");

    expect(clock()).toBe("2020-01-01T00:00:00.000Z");
    expect(clock()).toBe("2020-01-01T00:00:00.000Z");
  });
});
