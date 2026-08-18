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
          { day: "2024-06-15", rows: [{ id: "todo-1", title: "Buy milk" }] },
          { day: "2024-06-10", rows: [{ id: "todo-2", title: "Send invoice" }] },
        ]),
      ),
    );

    renderWithProviders(<LogbookView />);

    expect(await screen.findByText("2024-06-15")).toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByText("2024-06-10")).toBeInTheDocument();
    expect(screen.getByText("Send invoice")).toBeInTheDocument();
  });
});
