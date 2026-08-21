import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const packageRoot = resolve(root, "node_modules", "pdfjs-dist");
const targetRoot = resolve(root, "public", "pdfjs");
const EXPECTED_VERSION = "6.2.108";
const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));

if (packageJson.version !== EXPECTED_VERSION) {
  throw new Error(`Expected pdfjs-dist ${EXPECTED_VERSION}, found ${packageJson.version ?? "unknown"}.`);
}

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(resolve(packageRoot, directory), resolve(targetRoot, directory), { recursive: true });
}
await writeFile(resolve(targetRoot, "asset-version.json"), `${JSON.stringify({
  package: "pdfjs-dist",
  version: EXPECTED_VERSION,
  generatedAt: new Date().toISOString(),
}, null, 2)}\n`);
console.log(`PDF.js ${EXPECTED_VERSION} support assets copied to public/pdfjs.`);
