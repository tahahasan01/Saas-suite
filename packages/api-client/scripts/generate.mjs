// Regenerates packages/api-client from the FastAPI app:
//   1. services/api: python -m scripts.export_openapi  -> openapi.json
//   2. openapi-typescript                               -> src/schema.ts
// PYTHON picks the interpreter (CI: the setup-python one; locally the API venv).
// SKIP_EXPORT=1 reuses the committed openapi.json (no Python needed).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const apiDir = resolve(pkg, "../../services/api");
const specPath = join(pkg, "openapi.json");

if (!process.env.SKIP_EXPORT) {
  const python = process.env.PYTHON ?? "python";
  execFileSync(python, ["-m", "scripts.export_openapi", specPath], { cwd: apiDir, stdio: "inherit" });
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const ast = await openapiTS(spec, { alphabetize: false });
const header =
  "/* Generated from services/api's OpenAPI schema by packages/api-client/scripts/generate.mjs.\n" +
  " * Do not edit by hand: run `npm run api-client:generate`. CI fails when this is stale. */\n\n";
writeFileSync(join(pkg, "src", "schema.ts"), header + astToString(ast).replace(/\r\n/g, "\n"));
console.log("wrote src/schema.ts");
