import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { mswServer } from "./mswServer.js";

// jsdom doesn't implement scrollIntoView, which some dependencies (e.g.
// dnd-kit's sortable measuring) call unconditionally — without this it
// throws and silently aborts whatever triggered the call.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  mswServer.resetHandlers();
  cleanup();
});
afterAll(() => mswServer.close());
