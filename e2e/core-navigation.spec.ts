import { expect, test } from "@playwright/test";
import { createProject, createTodo, uniqueTitle } from "./helpers.js";

test("shows a project's todos, and inline rename persists", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await page.getByText(todoTitle).dblclick(); // start inline rename
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

test("double-clicking the detail pane's title renames the todo, and it persists across a reload", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await page.getByText(todoTitle).click(); // select + open the detail pane
  await page.locator(".detail-title").dblclick();

  const renameInput = page.locator(".detail-title-input");
  await renameInput.fill("Renamed from detail pane");
  await renameInput.press("Enter");

  await expect(
    page.getByRole("button", { name: "Renamed from detail pane", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".detail-title")).toHaveText("Renamed from detail pane");

  await page.reload();
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Renamed from detail pane", exact: true }),
  ).toBeVisible();
});

test("clicking outside the rename input commits it, and Escape cancels without also submitting", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await page.getByText(todoTitle).dblclick();
  const renameInput = page.locator('input:not([type="date"])');
  await renameInput.fill("Renamed by clicking away");
  await page.getByRole("button", { name: "Show completed" }).click(); // click elsewhere

  await expect(
    page.getByRole("button", { name: "Renamed by clicking away", exact: true }),
  ).toBeVisible();
  await expect(renameInput).toHaveCount(0);

  // Escape should cancel outright — the row title must stay untouched even
  // though unmounting the input can itself fire a native blur in a real
  // browser (the exact interaction this test also guards against). Scoped
  // to the row (not the detail pane, which shows the same title).
  await page
    .getByRole("button", { name: "Renamed by clicking away", exact: true })
    .dblclick();
  await page.locator('input:not([type="date"])').fill("Should never be saved");
  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("button", { name: "Renamed by clicking away", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Should never be saved")).toHaveCount(0);
});

test("clicking blank column space dismisses the task detail pane", async ({ page, request }) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const todoTitle = uniqueTitle("Todo");
  await createTodo(request, project.id, { title: todoTitle, sortKey: "a0" });

  await page.goto("/");
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await page.getByText(todoTitle).click();
  await expect(page.locator(".detail-pane")).toBeVisible();

  // Below the last row, inside the column's own body — not on any row.
  await page.locator(".column-body").click({ position: { x: 200, y: 400 } });

  await expect(page.locator(".detail-pane")).toHaveCount(0);
  // The row itself is untouched (still there, no longer shown selected) —
  // this only clears the selection, it doesn't delete or hide the todo.
  await expect(page.getByText(todoTitle)).toBeVisible();
});

test("switching to a different todo swaps the detail pane's content without dismissing it first", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Project"));
  const firstTitle = uniqueTitle("First");
  const secondTitle = uniqueTitle("Second");
  await createTodo(request, project.id, { title: firstTitle, sortKey: "a0" });
  await createTodo(request, project.id, { title: secondTitle, sortKey: "a1" });

  await page.goto("/");
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await page.getByText(firstTitle).click();
  await expect(page.locator(".detail-title")).toHaveText(firstTitle);

  // Never disappears at any point during the switch — a single detail pane,
  // still visible, whose content just swaps in place.
  await page.getByText(secondTitle).click();
  await expect(page.locator(".detail-pane")).toBeVisible();
  await expect(page.locator(".detail-title")).toHaveText(secondTitle);
  await expect(page.locator(".detail-pane")).toHaveCount(1);
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

  // Cmd+N opens a blank title input immediately — nothing is created until
  // it's submitted with a non-blank title (empty titles are rejected).
  const newInput = page.locator('input:not([type="date"])');
  await newInput.waitFor();
  await newInput.fill("Brand New Project");
  await newInput.press("Enter");

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

test("submitting a blank title does not create a project, and Escape cancels the pending input", async ({
  page,
  request,
}) => {
  const project = await createProject(request, uniqueTitle("Project"));
  let commandCount = 0;
  await page.route("**/api/commands", async (route) => {
    commandCount += 1;
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await page.keyboard.press("Meta+Shift+n"); // pending child input inside `project`

  const newInput = page.locator('input:not([type="date"])');
  await newInput.waitFor();
  await newInput.press("Enter"); // blank — must not submit
  await expect(newInput).toBeVisible(); // input stays open

  await newInput.press("Escape"); // cancels — no node ever created
  await expect(newInput).not.toBeVisible();

  expect(commandCount).toBe(0);
});
