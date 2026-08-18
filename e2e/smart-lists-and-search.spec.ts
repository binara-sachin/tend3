import { expect, test } from "@playwright/test";
import { createHeading, createProject, createTodo, setCompleted, trashNode, uniqueTitle } from "./helpers.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

test("Today shows a due-today todo grouped under its project", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Today Project"));
  const todoTitle = uniqueTitle("Due today");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0", whenDate: today() });

  await page.goto("/");
  await page.getByText("Today", { exact: true }).click();
  await page.getByTestId("today-view").waitFor();

  await expect(page.getByRole("heading", { name: project.title })).toBeVisible();
  await expect(page.getByText(todoTitle)).toBeVisible();
});

test("Logbook shows a completed todo under today's date", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Logbook Project"));
  const todoTitle = uniqueTitle("Completed today");
  const todo = await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });
  await setCompleted(request, todo.id, true);

  await page.goto("/");
  await page.getByText("Logbook", { exact: true }).click();
  await page.getByTestId("logbook-view").waitFor();

  await expect(page.getByRole("heading", { name: today() })).toBeVisible();
  await expect(page.getByText(todoTitle)).toBeVisible();
});

test("Trash: restore returns a todo to its column; permanently delete removes it for good", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Trash Project"));
  const restoreTitle = uniqueTitle("Restore me");
  const purgeTitle = uniqueTitle("Purge me");
  const toRestore = await createTodo(request, project.id, { title: restoreTitle, sortKey: "a0" });
  const toPurge = await createTodo(request, project.id, { title: purgeTitle, sortKey: "a1" });
  await trashNode(request, toRestore.id);
  await trashNode(request, toPurge.id);

  await page.goto("/");
  await page.getByText("Trash", { exact: true }).click();
  await page.getByTestId("trash-view").waitFor();
  await expect(page.getByText(restoreTitle)).toBeVisible();
  await expect(page.getByText(purgeTitle)).toBeVisible();

  await page.locator("li", { hasText: restoreTitle }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(restoreTitle)).toHaveCount(0);

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("li", { hasText: purgeTitle })
    .getByRole("button", { name: "Permanently delete" })
    .click();
  await expect(page.getByText(purgeTitle)).toHaveCount(0);

  await page.getByText(project.title).click();
  await expect(page.getByText(restoreTitle)).toBeVisible();
  await expect(page.getByText(purgeTitle)).toHaveCount(0);
});

test("Empty Trash clears every trashed item, confirmed via a dialog", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Empty Trash Project"));
  const title = uniqueTitle("Doomed");
  const todo = await createTodo(request, project.id, { title, sortKey: "a0" });
  await trashNode(request, todo.id);

  await page.goto("/");
  await page.getByText("Trash", { exact: true }).click();
  await page.getByTestId("trash-view").waitFor();
  await expect(page.getByText(title)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Empty Trash", exact: true }).click();

  await expect(page.getByText(title)).toHaveCount(0);
});

test("Cmd+K finds a todo by a notes-only match and opens its full column path", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Search Project"));
  const todoTitle = uniqueTitle("Unrelated title");
  const uniqueToken = `flavortoken${Date.now()}`;
  await createTodo(request, project.id, {
    title: todoTitle,
    sortKey: "a0",
    notes: `contains ${uniqueToken} in the notes`,
  });

  await page.goto("/");
  await page.getByText(project.title).waitFor(); // sidebar loaded
  await page.keyboard.press("Meta+k");
  await page.getByRole("dialog", { name: "Search" }).waitFor();
  await page.keyboard.type(uniqueToken);
  await expect(page.getByText(todoTitle)).toBeVisible({ timeout: 3000 });

  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);
  await expect(page.getByText(todoTitle).first()).toBeVisible();
  await expect(page.locator("textarea")).toHaveValue(new RegExp(uniqueToken));
});

test("Cmd+K finds a todo nested under a collapsed heading and expands the heading to reveal it", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Heading Search Project"));
  const heading = await createHeading(request, project.id, uniqueTitle("Heading"), "a0");
  const todoTitle = uniqueTitle("Todo under heading");
  const uniqueToken = `headingtoken${Date.now()}`;
  await createTodo(request, heading.id, {
    title: todoTitle,
    sortKey: "a0",
    notes: `contains ${uniqueToken}`,
  });

  await page.goto("/");
  await page.getByText(project.title).click();
  await expect(page.getByText(heading.title)).toBeVisible();
  await expect(page.getByText(todoTitle)).toHaveCount(0); // heading starts collapsed

  await page.keyboard.press("Meta+k");
  await page.getByRole("dialog", { name: "Search" }).waitFor();
  await page.keyboard.type(uniqueToken);
  await expect(page.getByText(todoTitle)).toBeVisible({ timeout: 3000 });
  await page.keyboard.press("Enter");

  await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);
  // The heading is now expanded — the todo shows inline without clicking it.
  await expect(page.getByText(todoTitle).first()).toBeVisible();
});
