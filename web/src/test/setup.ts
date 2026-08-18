import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { mswServer } from "./mswServer.js";

// jsdom doesn't implement scrollIntoView; dnd-kit's KeyboardSensor calls it
// unconditionally on drag activation, which otherwise throws and silently
// aborts the drag before any of its handlers run.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  mswServer.resetHandlers();
  cleanup();
});
afterAll(() => mswServer.close());
