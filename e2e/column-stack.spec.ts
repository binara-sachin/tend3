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
