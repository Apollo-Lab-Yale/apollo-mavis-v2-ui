/** gen:check — fail if vendored schemas or generated types drift.
 *
 * 1. schemas/ must byte-match ../apollo-xarm7-core/schemas (when present).
 * 2. src/gen must match a fresh regeneration from schemas/.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function diff(a: string, b: string, what: string): boolean {
  const r = spawnSync("git", ["diff", "--no-index", "--stat", "--exit-code", a, b], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`gen:check FAILED — ${what} drifted (see diff above)`);
    return false;
  }
  return true;
}

let ok = true;

const coreSchemas = resolve(root, "..", "apollo-xarm7-core", "schemas");
if (existsSync(coreSchemas)) {
  ok = diff(coreSchemas, join(root, "schemas"), "schemas/ vs core checkout") && ok;
} else {
  console.warn("gen:check: core sibling not found — skipping schema drift check");
}

const tmp = mkdtempSync(join(tmpdir(), "apollo-gen-"));
try {
  const r = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/gen-types.ts", tmp],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  if (r.status !== 0) {
    console.error("gen:check FAILED — regeneration errored");
    process.exit(1);
  }
  ok = diff(join(root, "src", "gen"), tmp, "src/gen vs regeneration") && ok;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (!ok) process.exit(1);
console.log("gen:check OK");
