import { setupServer } from "msw/node";

/**
 * Mock Service Worker for component tests. Tests add handlers per case with
 * `server.use(http.get(...))`; the setup file resets them after each test.
 */
export const server = setupServer();
