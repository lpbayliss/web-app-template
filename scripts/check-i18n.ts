/**
 * Verifies every message id referenced in the client exists in every locale file, that locale
 * files agree with each other, and that no locale carries orphaned ids.
 *
 * Messages are keyed by explicit ids (`intl.formatMessage({ id: "tasks.add" })`,
 * `<FormattedMessage id="tasks.add" />`); the JSON files are the source of truth, so a plain
 * scan is enough and needs no build step. Ids composed at runtime (`theme.${t}`) must use a
 * prefix listed in ALLOW_DYNAMIC_PREFIXES.
 *
 *   pnpm i18n:check
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const CLIENT_DIR = resolve("src/client");
const LOCALES_DIR = resolve("src/client/i18n");
const LOCALES = ["en", "de"] as const;
const ALLOW_DYNAMIC_PREFIXES = ["theme.", "activity.task."];
const ID_PATTERNS = [
  /formatMessage\(\s*\{\s*id:\s*"([^"]+)"/g,
  /<FormattedMessage[^>]*\sid="([^"]+)"/g,
  // ternary ids: id: cond ? "a" : "b"
  /id:\s*[^}]*?\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g,
];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry)) yield path;
  }
}

const used = new Set<string>();
for (const file of sourceFiles(CLIENT_DIR)) {
  const source = readFileSync(file, "utf8");
  for (const pattern of ID_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      for (const id of match.slice(1)) if (id) used.add(id);
    }
  }
}

const catalogs = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(resolve(LOCALES_DIR, `${locale}.messages.json`), "utf8")) as Record<
      string,
      string
    >,
  ]),
) as Record<(typeof LOCALES)[number], Record<string, string>>;

let failed = false;
for (const locale of LOCALES) {
  const defined = new Set(Object.keys(catalogs[locale]));
  const missing = [...used].filter((id) => !defined.has(id));
  const orphaned = [...defined].filter(
    (id) => !used.has(id) && !ALLOW_DYNAMIC_PREFIXES.some((prefix) => id.startsWith(prefix)),
  );
  const empty = [...defined].filter((id) => catalogs[locale][id]?.trim() === "");
  if (missing.length || orphaned.length || empty.length) failed = true;
  console.log(
    `${locale}: ${defined.size} messages, ${missing.length} missing, ${orphaned.length} orphaned, ${empty.length} empty`,
  );
  for (const id of missing) console.log(`  missing  ${id}`);
  for (const id of orphaned) console.log(`  orphaned ${id}`);
  for (const id of empty) console.log(`  empty    ${id}`);
}

const [base, ...others] = LOCALES;
for (const locale of others) {
  const a = new Set(Object.keys(catalogs[base]));
  const b = new Set(Object.keys(catalogs[locale]));
  const diff = [...a].filter((k) => !b.has(k)).concat([...b].filter((k) => !a.has(k)));
  if (diff.length) {
    failed = true;
    console.log(`${locale} and ${base} disagree on: ${diff.join(", ")}`);
  }
}

console.log(`${used.size} ids referenced in source`);
process.exit(failed ? 1 : 0);
