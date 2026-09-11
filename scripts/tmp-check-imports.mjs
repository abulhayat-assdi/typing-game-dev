// One-off M7 import-depth auditor. Resolves every relative import in
// apps/web runtime sources and reports unresolvable ones.
// Run: node scripts/tmp-check-imports.mjs  (deleted after use)
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = join("apps", "web");
const DIRS = ["app", "components", "lib", "messages"].map((d) => join(ROOT, d));
const EXTRA = [join(ROOT, "middleware.ts")];

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e);
    if (statSync(abs).isDirectory()) {
      if (e === "node_modules") continue;
      walk(abs, out);
    } else if (/\.(ts|tsx|mjs)$/.test(e)) {
      out.push(abs);
    }
  }
  return out;
}

const files = [...DIRS.flatMap((d) => walk(d)), ...EXTRA.filter((f) => existsSync(f))];
const IMPORT_RE =
  /(?:import|export)[^'"]*?from\s*["'](\.[^"']*)["']|import\s*["'](\.[^"']*)["']/g;

let bad = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  let m;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const spec = m[1] ?? m[2];
    const base = spec.replace(/\.(tsx?|mjs|json)$/, "");
    const candidates = [
      spec,
      base,
      base + ".ts",
      base + ".tsx",
      join(base, "index.ts"),
      join(base, "index.tsx"),
    ];
    const ok = candidates.some((c) => existsSync(resolve(dirname(f), c)));
    if (!ok) {
      bad += 1;
      console.log(`BAD ${relative("", f)} -> ${spec}`);
    }
  }
}
console.log(bad === 0 ? "ALL IMPORTS RESOLVE" : `${bad} bad imports`);
