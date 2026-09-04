/** gen:sync — vendor JSON schemas from the sibling core checkout into ./schemas. */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = resolve(root, "..", "apollo-mavis-v2-core", "schemas");
const dst = join(root, "schemas");

if (!existsSync(src)) {
  console.error(`gen:sync: sibling checkout not found at ${src}`);
  console.error("Clone apollo-mavis-v2-core next to apollo-mavis-v2-ui and retry.");
  process.exit(1);
}

const files = readdirSync(src).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(`gen:sync: no *.json schemas in ${src}`);
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log(`gen:sync: copied ${files.length} files -> schemas/`);
