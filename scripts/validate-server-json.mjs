// Validates server.json against the server.json schema in the
// modelcontextprotocol/registry repo (the dated schema named in $schema).
// Uses ajv and ajv-formats, which @modelcontextprotocol/sdk already installs.
import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const server = JSON.parse(await readFile(new URL("../server.json", import.meta.url), "utf8"));
const version = server.$schema.match(/schemas\/([0-9-]+)\/server\.schema\.json$/)?.[1];
if (!version) throw new Error(`Unexpected $schema: ${server.$schema}`);
const src = `https://raw.githubusercontent.com/modelcontextprotocol/registry/main/internal/validators/schemas/${version}.json`;
const res = await fetch(src);
if (!res.ok) throw new Error(`Could not fetch ${src}: HTTP ${res.status}`);
const schema = await res.json();

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const ok = ajv.validate(schema, server);
console.log(`schema: ${src}`);
if (!ok) {
  console.log(JSON.stringify(ajv.errors, null, 2));
  process.exit(1);
}

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const problems = [];
if (pkg.mcpName !== server.name) problems.push(`package.json mcpName ${pkg.mcpName} != server.json name ${server.name}`);
if (pkg.version !== server.version) problems.push(`package.json version ${pkg.version} != server.json version ${server.version}`);
for (const p of server.packages ?? []) {
  if (p.identifier !== pkg.name) problems.push(`package identifier ${p.identifier} != package.json name ${pkg.name}`);
  if (p.version !== pkg.version) problems.push(`package version ${p.version} != package.json version ${pkg.version}`);
}
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("server.json is valid against the schema and matches package.json");
