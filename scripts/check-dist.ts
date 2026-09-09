/** check-dist — runs after `vite build` (see `npm run build`): the production
 * bundle must carry nothing of the DEV server's runtime proxy.
 *
 * `vite.config.ts` defines `__APOLLO_RUNTIME_PROXY__` only under `vite` (serve);
 * a build gets `undefined`, so `lib/runtimeOrigin.ts`'s dev branch (the proxy
 * address and the "Dev server: /api is proxied…" note) is dead code and must not
 * survive. In the lab the runtime serves `dist/` itself and the Online DAgger sheet's
 * skill-install one-liner is the page origin — a leaked `localhost:8765` would
 * print the wrong port whenever RUNTIME_PORT ≠ 8765 and the dev note would lie. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assets = join(root, "dist", "assets");

/** Substrings that identify the dev-only branch; none may appear in any JS asset. */
export const FORBIDDEN = ["localhost:8765", "Dev server: /api is proxied"] as const;

if (!existsSync(join(root, "dist", "index.html")) || !existsSync(assets)) {
  console.error("check-dist FAILED — dist/ is missing (run `vite build` first)");
  process.exit(1);
}

const js = readdirSync(assets).filter((f) => f.endsWith(".js"));
if (js.length === 0) {
  console.error("check-dist FAILED — dist/assets has no JS bundle");
  process.exit(1);
}

let ok = true;
for (const file of js) {
  const text = readFileSync(join(assets, file), "utf8");
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      console.error(`check-dist FAILED — ${file} contains ${JSON.stringify(needle)}`);
      ok = false;
    }
  }
}

if (!ok) process.exit(1);
console.log(`check-dist OK — ${js.length} JS asset(s), no dev-proxy leak`);
