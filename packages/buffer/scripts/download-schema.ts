// Downloads Buffer's GraphQL schema through introspection and saves it as schema.graphql.
// The file is committed, so builds and codegen never need a Buffer API key.
// Run with `pnpm --filter @daydeck/buffer schema:download`. BUFFER_API_KEY is optional.
import { writeFile } from "node:fs/promises";
import {
  buildClientSchema,
  getIntrospectionQuery,
  type IntrospectionQuery,
  printSchema,
} from "graphql";

const endpoint = process.env.BUFFER_GRAPHQL_URL ?? "https://api.buffer.com";
const apiKey = process.env.BUFFER_API_KEY;

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  },
  body: JSON.stringify({ query: getIntrospectionQuery({ inputValueDeprecation: true }) }),
});

if (!response.ok) {
  throw new Error(`Schema download failed: ${response.status} ${await response.text()}`);
}

const body = (await response.json()) as { data?: IntrospectionQuery; errors?: unknown };
if (!body.data) {
  throw new Error(`Schema download returned no data: ${JSON.stringify(body.errors)}`);
}

const sdl = printSchema(buildClientSchema(body.data));
const target = new URL("../schema.graphql", import.meta.url);
await writeFile(target, `# Downloaded from ${endpoint}. Do not edit by hand.\n\n${sdl}\n`);
console.warn(`Saved ${sdl.length} characters to ${target.pathname}`);
