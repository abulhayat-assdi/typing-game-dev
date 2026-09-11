// Validates the Cloudflare Workers / OpenNext configuration (M1).
// Run: pnpm check:workers
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = resolve(root, "apps/web");

function fail(message: string): never {
  console.error(`check-workers FAILED: ${message}`);
  process.exit(1);
}

/** Minimal JSONC parser: strips // and block comments outside strings. */
function parseJsonc(text: string): unknown {
  let out = "";
  let inStr = false;
  let strCh = "";
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    const n = text[i + 1] ?? "";
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += n;
        i++;
      } else if (c === strCh) {
        inStr = false;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = true;
      strCh = c;
      out += c;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  return JSON.parse(out) as unknown;
}

// 1. wrangler.jsonc must sit beside the app and parse.
const wranglerPath = resolve(appDir, "wrangler.jsonc");
if (!existsSync(wranglerPath)) fail("apps/web/wrangler.jsonc missing");
const cfg = parseJsonc(readFileSync(wranglerPath, "utf8")) as Record<
  string,
  unknown
>;
for (const key of [
  "name",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "assets",
  "vars",
  "env",
  "observability",
]) {
  if (!(key in cfg)) fail(`wrangler.jsonc missing key: ${key}`);
}
if ((cfg as { main?: string }).main !== ".open-next/worker.js") {
  fail("wrangler.jsonc main must be .open-next/worker.js (OpenNext output)");
}
// 2. No real secrets in wrangler vars — placeholders only.
const varsText = JSON.stringify(cfg["vars"]) + JSON.stringify(cfg["env"]);
if (/sk-|AKIA|BEGIN PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\./.test(varsText)) {
  fail("wrangler.jsonc vars contain secret-like values");
}

// 3. open-next.config.ts must exist and use the adapter factory.
const openNextPath = resolve(appDir, "open-next.config.ts");
if (!existsSync(openNextPath)) fail("apps/web/open-next.config.ts missing");
const openNextSrc = readFileSync(openNextPath, "utf8");
if (!openNextSrc.includes("defineCloudflareConfig")) {
  fail("open-next.config.ts must use defineCloudflareConfig");
}

// 4. App scripts must route preview/deploy through the OpenNext CLI.
const pkg = JSON.parse(
  readFileSync(resolve(appDir, "package.json"), "utf8"),
) as { scripts?: Record<string, string> };
for (const [script, needle] of [
  ["build:worker", "opennextjs-cloudflare build"],
  ["preview", "opennextjs-cloudflare preview"],
  ["deploy", "opennextjs-cloudflare deploy"],
] as const) {
  if (!pkg.scripts?.[script]?.includes(needle)) {
    fail(`apps/web script "${script}" must run "${needle}"`);
  }
}

console.log(
  `check-workers OK — worker=${String((cfg as { name?: string }).name)}, main=.open-next/worker.js, adapter=defineCloudflareConfig, scripts wired.`,
);
