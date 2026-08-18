import { expect, test } from "@playwright/test";
import { createProject, createSubProject, createTodo, uniqueTitle } from "./helpers.js";

/**
 * Drag-and-drop is driven through dnd-kit's keyboard sensor rather than
 * simulated pointer events, per spec 8: pointer-based DnD simulation is
 * notoriously flaky, and the keyboard sensor exercises the same
 * reordering/reparenting logic deterministically. This also needs a real
 * browser's layout engine — jsdom reports every element as a zero-size
 * rect, which is exactly why this suite (and not an RTL test) covers it.
 */

function rowTitles(page: import("@playwright/test").Page) {
  return page.locator("[data-row='true']").allTextContents();
}

test("reordering within a column via the keyboard sensor persists across a reload", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const titleA = uniqueTitle("A");
  const titleB = uniqueTitle("B");
  const titleC = uniqueTitle("C");
  await createTodo(request, project.id, { title: titleA, sortKey: "a0" });
  await createTodo(request, project.id, { title: titleB, sortKey: "a1" });
  await createTodo(request, project.id, { title: titleC, sortKey: "a2" });

  await page.goto("/");
  await page.getByText(project.title).click();
  await expect(page.getByText(titleC)).toBeVisible();
  expect(await rowTitles(page)).toEqual([titleA, titleB, titleC]);

  const dragHandleA = page.getByLabel(`Drag ${titleA}`);
  await dragHandleA.focus();
  await page.keyboard.press("Space"); // pick up
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowDown"); // move past B
  await page.waitForTimeout(150);
  await page.keyboard.press("Space"); // drop
  await page.waitForTimeout(150);

  const reordered = await rowTitles(page);
  expect(reordered).toContain(titleA);
  expect(reordered.indexOf(titleA)).toBeGreaterThan(0); // no longer first

  await page.reload();
  await page.getByRole("button", { name: project.title, exact: true }).click();
  const afterReload = await rowTitles(page);
  expect(afterReload).toEqual(reordered); // the reorder round-tripped the server
});

test("reparenting onto a project row via the keyboard sensor moves the todo into it", async ({
  page,
  request,
}) => {
  const root = await createProject(request, uniqueTitle("Root"));
  const target = await createSubProject(request, root.id, uniqueTitle("Target"), "a0");
  const todoTitle = uniqueTitle("Movable todo");
  await createTodo(request, root.id, { title: todoTitle, sortKey: "a1" });

  await page.goto("/");
  await page.getByText(root.title).click();
  await expect(page.getByText(todoTitle)).toBeVisible();
  await expect(page.getByText(target.title)).toBeVisible();

  const dragHandle = page.getByLabel(`Drag ${todoTitle}`);
  await dragHandle.focus();
  await page.keyboard.press("Space"); // pick up
  await page.keyboard.press("ArrowDown"); // move onto/past the target project row
  await page.keyboard.press("Space"); // drop

  await page.waitForTimeout(300);
  await page.reload();
  await page.getByRole("button", { name: root.title, exact: true }).click();
  await page.getByText(target.title).click();

  await expect(page.getByText(todoTitle)).toBeVisible();
});
