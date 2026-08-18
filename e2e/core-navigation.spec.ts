import { expect, test } from "@playwright/test";
import { createProject, createTodo, uniqueTitle } from "./helpers.js";

test("shows a project's todos, and inline rename persists", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await page.getByText(todoTitle).click(); // select + focus the row
  await page.keyboard.press("Enter"); // start inline rename
  const renameInput = page.locator('input:not([type="date"])');
  await renameInput.fill("Renamed via E2E");
  await renameInput.press("Enter");

  // The row and the (now-open) detail pane both show the title — scope to
  // the row (the only one with a role) so the query stays unambiguous.
  await expect(page.getByRole("button", { name: "Renamed via E2E", exact: true })).toBeVisible();

  // Reload to prove the rename actually round-tripped through the server
  // (spec 7.5: no optimistic updates — nothing here is client-only state).
  await page.reload();
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await expect(page.getByRole("button", { name: "Renamed via E2E", exact: true })).toBeVisible();
  await expect(page.getByText(todoTitle)).toHaveCount(0);
});

test("editing notes in the detail pane persists across a reload", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0", notes: "original" });

  await page.goto("/");
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await page.getByText(todoTitle).click();
  const notes = page.locator("textarea");
  await notes.waitFor();
  await expect(notes).toHaveValue("original");
  await notes.fill("updated via E2E");
  await notes.blur();
  await page.waitForTimeout(300); // let the SetNotes request land

  await page.reload();
  await page.getByRole("button", { name: project.title, exact: true }).click();
  // The persisted open path already re-opens the todo's detail pane, so its
  // row and the detail pane's title both show todoTitle — scope to the row.
  await page.getByRole("button", { name: todoTitle, exact: true }).click();
  await expect(page.locator("textarea")).toHaveValue("updated via E2E");
});

test("Cmd+N at the sidebar level creates a new root-level project", async ({ page, request }) => {
  const existing = await createProject(request, uniqueTitle("Existing"));

  await page.goto("/");
  await page.getByText(existing.title).click(); // selects it, parentId "root"
  await page.keyboard.press("Meta+n");

  // The new project is created with a blank title — same two-step
  // click-then-Enter rename flow as a freshly created todo, not an
  // automatic focus/rename. Identify it by its (empty) accessible name
  // rather than position: the shared E2E database accumulates root-level
  // projects across the whole suite run, but every other fixture uses
  // uniqueTitle() and is never blank.
  const newRow = page.locator("nav ul").nth(1).getByRole("button", { name: "", exact: true });
  await expect(newRow).toHaveCount(1);
  await newRow.click();
  await page.keyboard.press("Enter");
  const renameInput = page.locator('input:not([type="date"])');
  await renameInput.waitFor();
  await renameInput.fill("Brand New Project");
  await renameInput.press("Enter");

  // Selecting it earlier already opened its column, so the sidebar entry
  // and the column header both now show the title — scope to the sidebar
  // button (the only one with a role) to stay unambiguous.
  const sidebarEntry = page.getByRole("button", { name: "Brand New Project", exact: true });
  await expect(sidebarEntry).toBeVisible();

  // Round-trips the server as a real root-level project, not a todo.
  await page.reload();
  await expect(sidebarEntry).toBeVisible();
  await sidebarEntry.click();
  await expect(page.getByRole("button", { name: "Show completed" })).toBeVisible();
});

test("Space toggles a todo's completion, hiding and (via Show completed) revealing it", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByText(project.title).click();
  await page.getByText(todoTitle).click();
  await page.keyboard.press(" ");

  // The detail pane stays open (still showing todoTitle) even once the row
  // is hidden, so scope to the row (the only one with a role) to check
  // specifically that IT is gone.
  const todoRow = page.getByRole("button", { name: todoTitle, exact: true });
  await expect(todoRow).toHaveCount(0);

  await page.getByRole("button", { name: "Show completed" }).click();
  await expect(todoRow).toBeVisible();
});
