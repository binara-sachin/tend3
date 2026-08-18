import { beforeEach, describe, expect, it } from "vitest";
import { getToday } from "../../queries/getToday.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;

beforeEach(() => {
  ({ repo } = createTestRepo());
});

describe("getToday", () => {
  it("sorts an overdue-deadline todo before a due-today todo in the same project", () => {
    const project = newNodeInput({ type: "project", title: "Work" });
    repo.insert(project);
    const dueToday = newNodeInput({
      type: "todo",
      parentId: project.id,
      whenDate: "2024-06-15",
      sortKey: "a",
    });
    repo.insert(dueToday);
    const overdue = newNodeInput({
      type: "todo",
      parentId: project.id,
      deadline: "2024-06-14",
      sortKey: "b",
    });
    repo.insert(overdue);

    const groups = getToday(repo, "2024-06-15");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows.map((r) => r.id)).toEqual([overdue.id, dueToday.id]);
  });

  it("groups todos by their nearest enclosing project, including through a heading", () => {
    const projectA = newNodeInput({ type: "project", title: "A" });
    repo.insert(projectA);
    const projectB = newNodeInput({ type: "project", title: "B" });
    repo.insert(projectB);
    const heading = newNodeInput({ type: "heading", parentId: projectA.id, title: "Section" });
    repo.insert(heading);
    const todoUnderHeading = newNodeInput({
      type: "todo",
      parentId: heading.id,
      whenDate: "2024-06-15",
    });
    repo.insert(todoUnderHeading);
    const todoUnderB = newNodeInput({ type: "todo", parentId: projectB.id, whenDate: "2024-06-15" });
    repo.insert(todoUnderB);

    const groups = getToday(repo, "2024-06-15");

    expect(groups.map((g) => g.projectId).sort()).toEqual([projectA.id, projectB.id].sort());
    const groupA = groups.find((g) => g.projectId === projectA.id);
    expect(groupA?.rows.map((r) => r.id)).toEqual([todoUnderHeading.id]);
  });

  it("excludes a todo whose ancestor project is trashed even though its own deletedAt is null", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    const todo = newNodeInput({ type: "todo", parentId: project.id, whenDate: "2024-06-15" });
    repo.insert(todo);
    repo.updateDeletedAt(project.id, "2024-06-15T00:00:00.000Z", "2024-06-15T00:00:00.000Z");

    const groups = getToday(repo, "2024-06-15");

    expect(groups).toHaveLength(0);
  });

  it("excludes a todo with neither when_date nor deadline in range", () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    const future = newNodeInput({ type: "todo", parentId: project.id, whenDate: "2024-06-16", sortKey: "a" });
    repo.insert(future);
    const never = newNodeInput({ type: "todo", parentId: project.id, sortKey: "b" });
    repo.insert(never);

    const groups = getToday(repo, "2024-06-15");

    expect(groups).toHaveLength(0);
  });

  it("orders groups themselves by their most urgent contained row", () => {
    const urgentProject = newNodeInput({ type: "project", title: "Urgent" });
    repo.insert(urgentProject);
    const overdue = newNodeInput({
      type: "todo",
      parentId: urgentProject.id,
      deadline: "2024-06-10",
    });
    repo.insert(overdue);

    const calmProject = newNodeInput({ type: "project", title: "Calm" });
    repo.insert(calmProject);
    const dueToday = newNodeInput({ type: "todo", parentId: calmProject.id, whenDate: "2024-06-15" });
    repo.insert(dueToday);

    const groups = getToday(repo, "2024-06-15");

    expect(groups.map((g) => g.projectId)).toEqual([urgentProject.id, calmProject.id]);
  });
});
