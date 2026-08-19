import fc from "fast-check";

export type TreeNode =
  | { type: "todo"; title: string }
  | { type: "heading"; title: string; children: TreeNode[] }
  | { type: "project"; title: string; children: TreeNode[] };

// Blank (or whitespace-only) titles are rejected by CreateNode/RenameNode
// (a real, permanent business rule — see commands/CreateNode.ts and
// commands/RenameNode.ts), so no valid tree can ever contain one.
const titleArb = fc.string({ minLength: 1, maxLength: 12 }).filter((title) => title.trim() !== "");

function todoArb(): fc.Arbitrary<TreeNode> {
  return titleArb.map((title) => ({ type: "todo" as const, title }));
}

// Headings are conservatively generated with todo-only children: the spec
// confirms heading's-parent-must-be-project and headings-never-nest, but is
// silent on whether a heading may contain a sub-project. todo-only is
// unambiguously valid under the enforced invariants.
function headingArb(): fc.Arbitrary<TreeNode> {
  return fc
    .tuple(titleArb, fc.array(todoArb(), { maxLength: 3 }))
    .map(([title, children]) => ({ type: "heading" as const, title, children }));
}

function projectArb(depth: number): fc.Arbitrary<TreeNode> {
  const childArb: fc.Arbitrary<TreeNode> =
    depth <= 0
      ? todoArb()
      : fc.oneof(todoArb(), headingArb(), projectArb(depth - 1));
  return fc
    .tuple(titleArb, fc.array(childArb, { maxLength: 3 }))
    .map(([title, children]) => ({ type: "project" as const, title, children }));
}

/** A random forest of root-level projects, each with a bounded-depth valid subtree. */
export function arbitraryForest(maxDepth = 2): fc.Arbitrary<TreeNode[]> {
  return fc.array(projectArb(maxDepth), { minLength: 1, maxLength: 3 });
}
