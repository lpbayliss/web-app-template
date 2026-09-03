import type { UserConfig } from "@commitlint/types";

/**
 * Conventional Commits drive semantic-release:
 *   feat  -> minor, fix/perf -> patch, "BREAKING CHANGE:" footer or "!" -> major.
 * Other types never trigger a release.
 */
const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [1, "always", 200],
  },
};

export default config;
