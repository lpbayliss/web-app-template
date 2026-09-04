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
  // `to` is the parent: tsdown copies the source directory into it, so this lands the SQL at
  // dist/server/migrations/, which is where MIGRATIONS_FOLDER resolves. Naming the full target
  // path here instead produces dist/server/migrations/migrations/ and migrate.js cannot find
  // meta/_journal.json.
  copy: [{ from: "src/server/db/migrations", to: "dist/server" }],
});
