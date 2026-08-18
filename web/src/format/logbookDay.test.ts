import { describe, expect, it } from "vitest";
import { formatLogbookDay } from "./logbookDay.js";

const TODAY = "2026-08-18";

describe("formatLogbookDay", () => {
  it("labels today's day as 'Today'", () => {
    expect(formatLogbookDay(TODAY, TODAY)).toBe("Today");
  });

  it("labels yesterday as 'Yesterday'", () => {
    expect(formatLogbookDay("2026-08-17", TODAY)).toBe("Yesterday");
  });

  it("labels an older day as its weekday and short date", () => {
    // 2026-08-10 is a Monday
    expect(formatLogbookDay("2026-08-10", TODAY)).toBe("Mon, Aug 10");
  });
});
