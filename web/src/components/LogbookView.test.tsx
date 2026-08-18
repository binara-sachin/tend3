// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { LogbookView } from "./LogbookView.js";

describe("LogbookView", () => {
  it("renders each day group under its own section header, with its rows listed", async () => {
    mswServer.use(
      http.get("/api/logbook", () =>
        HttpResponse.json([
          { day: "2024-06-15", rows: [{ id: "todo-1", type: "todo", title: "Buy milk" }] },
          { day: "2024-06-10", rows: [{ id: "todo-2", type: "todo", title: "Send invoice" }] },
        ]),
      ),
    );

    renderWithProviders(<LogbookView />);

    // 2024-06-15 and 2024-06-10 are both in the past relative to "now", so
    // the group header renders as a weekday/short-date label, not the raw
    // ISO string — see web/src/format/logbookDay.ts.
    expect(await screen.findByText("Sat, Jun 15")).toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByText("Mon, Jun 10")).toBeInTheDocument();
    expect(screen.getByText("Send invoice")).toBeInTheDocument();
  });
});
