import { describe, expect, it } from "vitest";
import { formatDeletedAgo } from "./deletedAgo.js";

const TODAY = "2026-08-18";

describe("formatDeletedAgo", () => {
  it("labels a deletion today as 'Deleted today'", () => {
    expect(formatDeletedAgo("2026-08-18T10:00:00.000Z", TODAY)).toBe("Deleted today");
  });

  it("labels a deletion yesterday as 'Deleted yesterday'", () => {
    expect(formatDeletedAgo("2026-08-17T23:00:00.000Z", TODAY)).toBe("Deleted yesterday");
  });

  it("labels an older deletion with a day count", () => {
    expect(formatDeletedAgo("2026-08-16T00:00:00.000Z", TODAY)).toBe("Deleted 2 days ago");
  });
});
