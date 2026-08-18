import { describe, expect, it } from "vitest";
import { highlightMatches } from "./highlight.js";

describe("highlightMatches", () => {
  it("returns the whole text unmatched when the query is empty", () => {
    expect(highlightMatches("Buy milk", "")).toEqual([{ text: "Buy milk", matched: false }]);
  });

  it("returns the whole text unmatched when there is no match", () => {
    expect(highlightMatches("Buy milk", "eggs")).toEqual([{ text: "Buy milk", matched: false }]);
  });

  it("splits out a single case-insensitive match", () => {
    expect(highlightMatches("Send contractor invoice", "invoice")).toEqual([
      { text: "Send contractor ", matched: false },
      { text: "invoice", matched: true },
    ]);
  });

  it("matches case-insensitively while preserving the source's original casing", () => {
    expect(highlightMatches("Send contractor Invoice", "invoice")).toEqual([
      { text: "Send contractor ", matched: false },
      { text: "Invoice", matched: true },
    ]);
  });

  it("highlights every occurrence, including as a prefix of a longer word", () => {
    expect(highlightMatches("Notes on outstanding invoices", "invoice")).toEqual([
      { text: "Notes on outstanding ", matched: false },
      { text: "invoice", matched: true },
      { text: "s", matched: false },
    ]);
  });
});
