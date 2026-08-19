import { expect, test } from "@playwright/test";
import { createHeading, createProject, createSubProject, createTodo, uniqueTitle } from "./helpers.js";

test("navigating into nested projects extends the column stack, and re-selecting truncates it", async ({
  page,
  request,
}) => {
  const root = await createProject(request, uniqueTitle("Root"));
  const subA = await createSubProject(request, root.id, uniqueTitle("Sub A"), "a0");
  const subB = await createSubProject(request, root.id, uniqueTitle("Sub B"), "a1");
  const todoInATitle = uniqueTitle("Todo in A");
  const todoInBTitle = uniqueTitle("Todo in B");
  await createTodo(request, subA.id, { title: todoInATitle, sortKey: "a0" });
  await createTodo(request, subB.id, { title: todoInBTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByText(root.title).click();
  await expect(page.getByText(subA.title)).toBeVisible();
  await expect(page.getByText(subB.title)).toBeVisible();

  await page.getByText(subA.title).click();
  await expect(page.getByText(todoInATitle)).toBeVisible();

  // Re-selecting a sibling at the earlier column truncates the column that
  // was showing subA's contents and replaces it with subB's.
  await page.getByText(subB.title).click();
  await expect(page.getByText(todoInBTitle)).toBeVisible();
  await expect(page.getByText(todoInATitle)).toHaveCount(0);
});

test("the column header's New sub-project button creates a real, navigable sub-project", async ({
  page,
  request,
}) => {
  const root = await createProject(request, uniqueTitle("Root"));

  await page.goto("/");
  await page.getByText(root.title).click();
  await page.getByRole("button", { name: "New sub-project" }).click();

  const input = page.locator('input:not([type="date"])');
  await input.fill("Frozen foods");
  await input.press("Enter");

  const subProjectRow = page.getByRole("button", { name: "Frozen foods", exact: true });
  await expect(subProjectRow).toBeVisible();

  // Navigable like any other project — a todo created inside it should show
  // up in ITS OWN column once opened, proving it's a real project row and
  // not, say, a todo that merely happens to be named "Frozen foods".
  await subProjectRow.click();
  // Root's own column is still open alongside the sub-project's — scope to
  // the last (most recently opened) column's own "New item" button.
  await page.getByRole("button", { name: "New item" }).last().click();
  const todoInput = page.locator('input:not([type="date"])');
  await todoInput.fill("Peas");
  await todoInput.press("Enter");
  await expect(page.getByText("Peas")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: root.title, exact: true }).click();
  await expect(subProjectRow).toBeVisible();
});

test("clicking a heading expands its children inline, without opening a new column", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const heading = await createHeading(request, project.id, uniqueTitle("Heading"), "a0");
  const todoTitle = uniqueTitle("Todo under heading");
  await createTodo(request, heading.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByText(project.title).click();
  await expect(page.getByText(heading.title)).toBeVisible();
  await expect(page.getByText(todoTitle)).toHaveCount(0);

  await page.getByText(heading.title).click();
  await expect(page.getByText(todoTitle)).toBeVisible();

  await page.getByText(heading.title).click();
  await expect(page.getByText(todoTitle)).toHaveCount(0);
});
