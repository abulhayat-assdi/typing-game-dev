/**
 * M3 tests #9 (server-only credential protection) + #10 (Workers compat).
 *
 * Static import-surface scan over first-party runtime sources:
 *  - no `node:` imports anywhere in app/components/lib/middleware
 *    (Workers-safe; nodejs_compat covers the SDKs, our code stays clean);
 *  - server-only secret names never appear outside lib/server;
 *  - client components never import lib/server, @aws-sdk/* or @supabase/*.
 *
 * This file itself uses node:fs — test-only, excluded from the scan
 * (only *.ts/*.tsx/*.mjs non-test sources are scanned).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const WEB_DIR = dirname(fileURLToPath(new URL(".", import.meta.url)));
const SCAN_ROOTS = ["app", "components", "lib"].map((d) => join(WEB_DIR, d));
const MIDDLEWARE = join(WEB_DIR, "middleware.ts");
const CLIENT_SEP = `components${sep}`;
const SERVER_SEP = join("lib", "server") + sep;

interface SourceFile {
  rel: string;
  content: string;
}

function walk(dir: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      walk(abs, out);
    } else if (/\.(ts|tsx|mjs)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push({ rel: relative(WEB_DIR, abs), content: readFileSync(abs, "utf8") });
    }
  }
  return out;
}

function collectSources(): SourceFile[] {
  const files: SourceFile[] = [];
  for (const root of SCAN_ROOTS) walk(root, files);
  files.push({
    rel: "middleware.ts",
    content: readFileSync(MIDDLEWARE, "utf8"),
  });
  return files;
}

const NODE_IMPORT =
  /(?:from\s+["']node:|require\(\s*["']node:|["']node:(?!test)[a-z/]+["'])/;
const SECRET_NAMES =
  /SUPABASE_SERVICE_ROLE_KEY|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|AUTH_SECRET/;
// Import statements only (comments/docs may legitimately name these modules).
// `import type` is erased at compile and carries zero runtime surface.
// @supabase/ssr is allowed in clients: it only ever carries the public anon
// key (browser client). @supabase/supabase-js and lib/server stay banned.
const SERVER_IMPORT_STATEMENT =
  /^import\s+(?!type\b)[^;]*?(lib\/server|@aws-sdk\/|@supabase\/supabase-js)/m;

function isClientComponent(f: SourceFile): boolean {
  return f.rel.startsWith(CLIENT_SEP) || f.content.includes('"use client"');
}

describe("server boundary + Workers import surface", () => {
  const files = collectSources();

  it("has runtime sources to scan (guard against silent empty scans)", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.rel === "middleware.ts")).toBe(true);
  });

  it("uses no node: imports in runtime code", () => {
    for (const f of files) {
      expect(NODE_IMPORT.test(f.content), `${f.rel} imports node:`).toBe(false);
    }
  });

  it("keeps server-only secret names inside lib/server", () => {
    for (const f of files) {
      if (f.rel.startsWith(SERVER_SEP)) continue;
      expect(SECRET_NAMES.test(f.content), `${f.rel} leaks secret name`).toBe(
        false,
      );
    }
  });

  it("client components never import server modules or API SDKs", () => {
    const clients = files.filter(isClientComponent);
    expect(clients.length).toBeGreaterThan(0);
    for (const f of clients) {
      expect(
        SERVER_IMPORT_STATEMENT.test(f.content),
        `${f.rel} imports server code`,
      ).toBe(false);
    }
  });

  it("middleware stays edge-safe (no API SDKs, exports matcher)", () => {
    const mw = files.find((f) => f.rel === "middleware.ts");
    expect(mw).toBeDefined();
    expect(SERVER_IMPORT_STATEMENT.test(mw?.content ?? "")).toBe(false);
    expect(mw?.content).toContain("export const config");
    expect(mw?.content).toContain("export function middleware");
  });
});
