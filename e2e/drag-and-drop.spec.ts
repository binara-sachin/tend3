import { expect, test, type Locator, type Page } from "@playwright/test";
import { createProject, createSubProject, createTodo, uniqueTitle } from "./helpers.js";

/**
 * Drag-and-drop is driven through real pointer events — dnd-kit's keyboard
 * sensor was removed (Space and Enter no longer do anything; arrow keys are
 * reserved for row/column focus navigation), so pointer simulation is the
 * only way left to exercise reordering/reparenting. This needs a real
 * browser's layout engine — jsdom reports every element as a zero-size
 * rect — which is exactly why this suite (and not an RTL test) covers it.
 */

function rowTitles(page: Page) {
  return page.locator("[data-row='true']").allTextContents();
}

/** The sidebar's root-level project list, in DOM order — includes Inbox and every other test's accumulated fixtures. */
function sidebarProjectTitles(page: Page) {
  return page.locator("nav ul").nth(1).locator(".sidebar-item").allTextContents();
}

/**
 * Drags `from` onto `to` via real mouse events: down, a small move past the
 * pointer sensor's 8px activation-distance threshold, a move to the target,
 * then up. Both locators are read for their bounding box up front, so the
 * caller doesn't need real layout beyond what Playwright already provides.
 */
async function dragRow(page: Page, from: Locator, to: Locator) {
  const fromBox = await from.boundingBox();
  const toBox = await to.boundingBox();
  if (!fromBox || !toBox) throw new Error("dragRow: source or target has no layout box");

  const startX = fromBox.x + fromBox.width / 2;
  const startY = fromBox.y + fromBox.height / 2;
  const endX = toBox.x + toBox.width / 2;
  const endY = toBox.y + toBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 12, { steps: 5 }); // clear the activation threshold
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

test("reordering within a column via pointer drag persists across a reload", async ({
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

  // There's no separate drag handle — the row itself is the draggable
  // surface, click-and-drag from anywhere on it.
  const rowA = page.getByRole("button", { name: titleA, exact: true });
  const rowB = page.getByRole("button", { name: titleB, exact: true });
  await dragRow(page, rowA, rowB); // move past B

  const reordered = await rowTitles(page);
  expect(reordered).toContain(titleA);
  expect(reordered.indexOf(titleA)).toBeGreaterThan(0); // no longer first

  await page.reload();
  await page.getByRole("button", { name: project.title, exact: true }).click();
  const afterReload = await rowTitles(page);
  expect(afterReload).toEqual(reordered); // the reorder round-tripped the server
});

test("reordering root-level projects via pointer drag persists, with Inbox pinned first", async ({
  page,
}) => {
  const firstTitle = uniqueTitle("SidebarFirst");
  const secondTitle = uniqueTitle("SidebarSecond");

  await page.goto("/");
  await page.getByRole("button", { name: "Inbox", exact: true }).waitFor();

  // Created through the real "+ New Project" UI flow (not a raw API call
  // with a hardcoded sortKey) specifically so both rows get real,
  // guaranteed-distinct sortKeys via sortKeyAfter — the shared e2e database
  // accumulates many root-level projects across the whole suite run, and
  // several other spec files' fixtures share a hardcoded "a0" sortKey, which
  // made an earlier version of this test flaky: reordering against a
  // same-keyed neighbor asks the fractional-indexing library for a key
  // strictly between two equal keys, which it rejects.
  async function createRootProjectViaUi(title: string) {
    await page.getByRole("button", { name: "New Project", exact: true }).click();
    const newInput = page.locator('input:not([type="date"])');
    await newInput.waitFor();
    await newInput.fill(title);
    await newInput.press("Enter");
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
  }

  await createRootProjectViaUi(firstTitle);
  await createRootProjectViaUi(secondTitle);

  const before = await sidebarProjectTitles(page);
  expect(before[0]).toBe("Inbox");
  expect(before.indexOf(firstTitle)).toBeLessThan(before.indexOf(secondTitle));

  const rowFirst = page.getByRole("button", { name: firstTitle, exact: true });
  const rowSecond = page.getByRole("button", { name: secondTitle, exact: true });
  await dragRow(page, rowSecond, rowFirst); // move above "first"

  // The drop fires a MoveNode command and refetches the sidebar's root
  // column — poll instead of a fixed wait for that round-trip.
  await expect
    .poll(async () => {
      const titles = await sidebarProjectTitles(page);
      return titles.indexOf(secondTitle) < titles.indexOf(firstTitle);
    })
    .toBe(true);
  expect((await sidebarProjectTitles(page))[0]).toBe("Inbox"); // still pinned first, never displaced

  await page.reload();
  await expect
    .poll(async () => {
      const titles = await sidebarProjectTitles(page);
      return titles.indexOf(secondTitle) < titles.indexOf(firstTitle);
    })
    .toBe(true);
  expect((await sidebarProjectTitles(page))[0]).toBe("Inbox");
});

test("moving a root-level project into a sub-project removes it from the sidebar immediately, no reload needed", async ({
  page,
  request,
}) => {
  const root = await createProject(request, uniqueTitle("Root"));
  const target = await createSubProject(request, root.id, uniqueTitle("Target"), "a0");
  const movable = await createProject(request, uniqueTitle("MovableRootProject"));

  await page.goto("/");
  await page.getByRole("button", { name: movable.title, exact: true }).waitFor();
  await page.getByText(root.title).click();
  await expect(page.getByText(target.title)).toBeVisible();

  const movableRow = page.getByRole("button", { name: movable.title, exact: true });
  const targetDropZone = page.locator(`[data-droppable-id="project-drop-${target.id}"]`);
  await dragRow(page, movableRow, targetDropZone);

  // No reload — this is the actual regression: the source (sidebar root
  // list) was never invalidated, only the destination and whatever
  // happened to already be open.
  await expect(page.getByRole("button", { name: movable.title, exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: movable.title, exact: true })).toHaveCount(0);
  await page.getByText(target.title).click();
  await expect(page.getByText(movable.title)).toBeVisible();
});

test("dragging a task onto a different root-level project's sidebar row moves it there", async ({
  page,
  request,
}) => {
  const openProject = await createProject(request, uniqueTitle("OpenProject"));
  const otherProject = await createProject(request, uniqueTitle("OtherMainProject"));
  const todoTitle = uniqueTitle("CrossProjectTodo");
  await createTodo(request, openProject.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByRole("button", { name: otherProject.title, exact: true }).waitFor();
  await page.getByText(openProject.title).click();
  await expect(page.getByText(todoTitle)).toBeVisible();

  // otherProject's column is never opened — only its sidebar row is ever on
  // screen, which is exactly the scenario this fixes: previously there was
  // no way to drop a task onto a different main project without both
  // columns open simultaneously (impossible — only one root chain opens at
  // a time), since ordinary sidebar rows weren't valid drop targets.
  const todoRow = page.getByRole("button", { name: todoTitle, exact: true });
  const otherProjectSidebarRow = page.getByRole("button", { name: otherProject.title, exact: true });
  await dragRow(page, todoRow, otherProjectSidebarRow);

  await expect(page.getByText(todoTitle)).toHaveCount(0); // gone from openProject's column

  await page.reload();
  await page.getByRole("button", { name: otherProject.title, exact: true }).click();
  await expect(page.getByText(todoTitle)).toBeVisible();
});

test("reparenting onto a project row via pointer drag moves the todo into it", async ({
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

  const todoRow = page.getByRole("button", { name: todoTitle, exact: true });
  // The whole-row "drop into project" target, not just the target's text —
  // this is what the collision strategy actually keys on (see DragProvider).
  const targetDropZone = page.locator(`[data-droppable-id="project-drop-${target.id}"]`);
  await dragRow(page, todoRow, targetDropZone);

  await page.reload();
  await page.getByRole("button", { name: root.title, exact: true }).click();
  await page.getByText(target.title).click();

  await expect(page.getByText(todoTitle)).toBeVisible();
});
