import { expect, test } from "@playwright/test";
import { createProject, createTodo, uniqueTitle } from "./helpers.js";

test("shows a project's todos, and inline rename persists", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByText(project.title).click();
  await page.getByText(todoTitle).click(); // select + focus the row
  await page.keyboard.press("Enter"); // start inline rename
  const renameInput = page.locator('input:not([type="date"])');
  await renameInput.fill("Renamed via E2E");
  await renameInput.press("Enter");

  await expect(page.getByText("Renamed via E2E")).toBeVisible();

  // Reload to prove the rename actually round-tripped through the server
  // (spec 7.5: no optimistic updates — nothing here is client-only state).
  await page.reload();
  await page.getByText(project.title).click();
  await expect(page.getByText("Renamed via E2E")).toBeVisible();
  await expect(page.getByText(todoTitle)).toHaveCount(0);
});

test("editing notes in the detail pane persists across a reload", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0", notes: "original" });

  await page.goto("/");
  await page.getByText(project.title).click();
  await page.getByText(todoTitle).click();
  const notes = page.locator("textarea");
  await notes.waitFor();
  await expect(notes).toHaveValue("original");
  await notes.fill("updated via E2E");
  await notes.blur();
  await page.waitForTimeout(300); // let the SetNotes request land

  await page.reload();
  await page.getByText(project.title).click();
  await page.getByText(todoTitle).click();
  await expect(page.locator("textarea")).toHaveValue("updated via E2E");
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

  await expect(page.getByText(todoTitle)).toHaveCount(0);

  await page.getByRole("button", { name: "Show completed" }).click();
  await expect(page.getByText(todoTitle)).toBeVisible();
});
