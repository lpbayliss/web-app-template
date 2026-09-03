import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to the SQL migrations. Resolved from this file so it works from `tsx` (src/)
 * and from the bundled server (dist/server/, where the folder is copied by the build).
 */
export const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
