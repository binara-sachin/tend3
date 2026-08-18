// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { TodayView } from "./TodayView.js";

describe("TodayView", () => {
  it("renders each project group under its own section header, with its rows listed", async () => {
    mswServer.use(
      http.get("/api/today", () =>
        HttpResponse.json([
          {
            projectId: "p1",
            projectTitle: "Groceries",
            rows: [{ id: "todo-1", title: "Buy milk" }],
          },
          {
            projectId: "p2",
            projectTitle: "Work",
            rows: [{ id: "todo-2", title: "Send invoice" }],
          },
        ]),
      ),
    );

    renderWithProviders(<TodayView />);

    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Send invoice")).toBeInTheDocument();
  });

  it("renders nothing extra when there are no groups", async () => {
    mswServer.use(http.get("/api/today", () => HttpResponse.json([])));

    const { container } = renderWithProviders(<TodayView />);

    await screen.findByTestId("today-view");
    expect(container.querySelectorAll("section")).toHaveLength(0);
  });
});
