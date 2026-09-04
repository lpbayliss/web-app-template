import { defineConfig } from "tsdown";

/**
 * Server bundle. Dependencies stay external (installed in the image), except `react-email`,
 * which is a devDependency inlined here so its CLI-heavy dependency tree never ships.
 */
export default defineConfig({
  entry: {
    main: "src/server/main.ts",
    worker: "src/server/worker.main.ts",
    migrate: "src/server/db/migrate.ts",
    instrumentation: "src/server/instrumentation.ts",
  },
  outDir: "dist/server",
  format: "esm",
  platform: "node",
  target: "node24",
  tsconfig: "tsconfig.server.json",
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  noExternal: ["react-email"],
  copy: [{ from: "src/server/db/migrations", to: "dist/server/migrations" }],
});
