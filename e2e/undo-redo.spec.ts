import { expect, test } from "@playwright/test";
import { createProject, createTodo, trashNode, uniqueTitle } from "./helpers.js";

test("Cmd+Z / Cmd+Shift+Z undo and redo a rename", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const originalTitle = uniqueTitle("Original");
  await createTodo(request, project.id, { title: originalTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByText(project.title).click();
  await page.getByText(originalTitle).click();
  await page.keyboard.press("Enter");
  const renameInput = page.locator('input:not([type="date"])');
  await renameInput.fill("Renamed via E2E");
  await renameInput.press("Enter");
  await expect(page.getByText("Renamed via E2E")).toBeVisible();

  await page.keyboard.press("Meta+z");
  await expect(page.getByText(originalTitle)).toBeVisible();

  await page.keyboard.press("Meta+Shift+z");
  await expect(page.getByText("Renamed via E2E")).toBeVisible();
});

test("Cmd+Z reverts a notes edit visible in an already-open detail pane", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, {
    title: todoTitle,
    sortKey: "a0",
    notes: "original notes",
  });

  await page.goto("/");
  await page.getByText(project.title).click();
  await page.getByText(todoTitle).click();
  const notes = page.locator("textarea");
  await notes.waitFor();
  await notes.fill("edited notes");
  await notes.blur();
  await page.waitForTimeout(300); // let SetNotes round-trip
  await expect(notes).toHaveValue("edited notes");

  await page.keyboard.press("Meta+z");

  await expect(notes).toHaveValue("original notes");
});

test("Cmd+Z is a no-op after Empty Trash has cleared the stack", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  const todo = await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });
  await trashNode(request, todo.id);

  await page.goto("/");
  await page.getByText("Trash", { exact: true }).click();
  await page.getByTestId("trash-view").waitFor();
  await expect(page.getByText(todoTitle)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Empty Trash", exact: true }).click();
  await expect(page.getByText(todoTitle)).toHaveCount(0);

  await page.keyboard.press("Meta+z");
  await page.waitForTimeout(300);

  // Nothing should have come back — the stack was cleared, not just this entry skipped.
  await expect(page.getByText(todoTitle)).toHaveCount(0);
});
