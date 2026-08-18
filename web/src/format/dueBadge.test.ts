import { describe, expect, it } from "vitest";
import { formatColumnDueBadge, formatTodayBadge } from "./dueBadge.js";

const TODAY = "2026-08-18"; // a Tuesday

describe("formatColumnDueBadge", () => {
  it("returns null when there is no whenDate", () => {
    expect(formatColumnDueBadge(null, TODAY)).toBeNull();
  });

  it("labels whenDate === today as an accent 'Today' badge", () => {
    expect(formatColumnDueBadge(TODAY, TODAY)).toEqual({ text: "Today", tone: "accent" });
  });

  it("labels whenDate === tomorrow as a neutral 'Tomorrow' badge", () => {
    expect(formatColumnDueBadge("2026-08-19", TODAY)).toEqual({
      text: "Tomorrow",
      tone: "neutral",
    });
  });

  it("labels a whenDate within the coming week as its weekday name", () => {
    // 2026-08-21 is a Friday
    expect(formatColumnDueBadge("2026-08-21", TODAY)).toEqual({ text: "Fri", tone: "neutral" });
  });

  it("labels a whenDate further out as a short date", () => {
    expect(formatColumnDueBadge("2026-09-30", TODAY)).toEqual({ text: "Sep 30", tone: "neutral" });
  });
});

describe("formatTodayBadge", () => {
  it("labels an overdue deadline of exactly one day as 'yesterday'", () => {
    expect(formatTodayBadge(null, "2026-08-17", TODAY)).toEqual({
      text: "Overdue · deadline yesterday",
      tone: "accent",
    });
  });

  it("labels an overdue deadline of multiple days with a day count", () => {
    expect(formatTodayBadge(null, "2026-08-16", TODAY)).toEqual({
      text: "Overdue · deadline 2 days ago",
      tone: "accent",
    });
  });

  it("labels a deadline of today as neutral 'Deadline today'", () => {
    expect(formatTodayBadge(null, TODAY, TODAY)).toEqual({
      text: "Deadline today",
      tone: "neutral",
    });
  });

  it("falls back to whenDate when there is no deadline, labeling today as 'When: today'", () => {
    expect(formatTodayBadge(TODAY, null, TODAY)).toEqual({
      text: "When: today",
      tone: "neutral",
    });
  });

  it("labels an overdue whenDate (no deadline) as accent 'Overdue'", () => {
    expect(formatTodayBadge("2026-08-16", null, TODAY)).toEqual({
      text: "Overdue",
      tone: "accent",
    });
  });

  it("prioritizes the deadline over the whenDate when both are present", () => {
    expect(formatTodayBadge(TODAY, "2026-08-17", TODAY)).toEqual({
      text: "Overdue · deadline yesterday",
      tone: "accent",
    });
  });
});
