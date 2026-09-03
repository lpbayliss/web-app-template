import { afterEach } from "vitest";
import { Logger } from "#core";

// Keep test output readable: only warnings and errors reach the console.
Logger.level = "warn";

afterEach(() => {
  // Individual tests may raise the level; put it back.
  Logger.level = "warn";
});
