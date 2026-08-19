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

/** The sidebar's root-level project list, in DOM order — includes Inbox and every other test's accumulated fixtures. */
function sidebarProjectTitles(page: import("@playwright/test").Page) {
  return page.locator("nav ul").nth(1).locator(".sidebar-item").allTextContents();
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

  // There's no separate drag handle — the row itself is the sortable node,
  // focusable and keyboard-activatable directly.
  const dragHandleA = page.getByRole("button", { name: titleA, exact: true });
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

test("reordering root-level projects via the keyboard sensor persists, with Inbox pinned first", async ({
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

  const dragHandle = page.getByRole("button", { name: secondTitle, exact: true });
  await dragHandle.focus();
  await page.keyboard.press("Space"); // pick up
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowUp"); // move above "first"
  await page.waitForTimeout(150);
  await page.keyboard.press("Space"); // drop

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

  const dragHandle = page.getByRole("button", { name: todoTitle, exact: true });
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
