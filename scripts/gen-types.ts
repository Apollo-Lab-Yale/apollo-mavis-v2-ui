/** gen:types — compile vendored JSON schemas into src/gen/protocol.ts.
 *
 * All model schemas (per schemas/index.json) are combined into one synthetic
 * root so shared $defs (ArmTelemetry, CameraInfo, ...) are emitted exactly
 * once. Output dir is overridable (used by gen:check).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { compile } from "json-schema-to-typescript";

const root = resolve(import.meta.dirname, "..");
const schemasDir = join(root, "schemas");
const outDir = process.argv[2] ? resolve(process.argv[2]) : join(root, "src", "gen");

const BANNER = "/* AUTO-GENERATED from apollo-mavis-v2-core schemas — do not edit. */";

/** json-schema-to-typescript predates draft 2020-12 tuples: rewrite
 * `prefixItems` into the draft-07 positional-`items` form it understands. */
function fixTuples(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) fixTuples(item);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj["prefixItems"])) {
    obj["items"] = obj["prefixItems"];
    obj["additionalItems"] = false;
    delete obj["prefixItems"];
  }
  for (const v of Object.values(obj)) fixTuples(v);
}

async function main(): Promise<void> {
  const index = JSON.parse(readFileSync(join(schemasDir, "index.json"), "utf8")) as {
    core_version: string;
    models: string[];
  };

  // Merge every model schema into one root: hoist each model's $defs into a
  // shared pool and reference models via $defs so names are stable.
  const defs: Record<string, unknown> = {};
  for (const name of index.models) {
    const schema = JSON.parse(readFileSync(join(schemasDir, `${name}.json`), "utf8")) as Record<
      string,
      unknown
    >;
    const nested = (schema["$defs"] ?? {}) as Record<string, unknown>;
    delete schema["$defs"];
    for (const [k, v] of Object.entries(nested)) defs[k] ??= v;
    defs[name] ??= schema;
  }
  const rootSchema = {
    title: "ApolloProtocol",
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(index.models.map((m) => [m, { $ref: `#/$defs/${m}` }])),
    $defs: defs,
  };
  fixTuples(rootSchema);

  const ts = await compile(rootSchema as never, "ApolloProtocol", {
    additionalProperties: false,
    bannerComment: `${BANNER}\n/* core_version: ${index.core_version} */`,
    style: { printWidth: 100 },
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "protocol.ts"), ts);
  writeFileSync(join(outDir, "index.ts"), `${BANNER}\nexport * from "./protocol";\n`);
  console.log(`gen:types: wrote ${join(outDir, "protocol.ts")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
