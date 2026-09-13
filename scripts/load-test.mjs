#!/usr/bin/env node
/**
 * M18: dependency-free HTTP load harness (Node 20+, no packages).
 * Hitting real endpoints (never one-write-per-keystroke: typing stays
 * local; this measures page/API latency under concurrency).
 *
 * Usage:
 *   node scripts/load-test.mjs --url http://127.0.0.1:3000 \
 *     --concurrency 25 --requests 200 --paths /api/health,/en
 *   node scripts/load-test.mjs --url https://staging.example \
 *     --concurrency 100 --requests 1000 --paths-file scripts/load-paths.txt
 *
 * Exit non-zero when error rate exceeds --max-error-rate (default 1%).
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

const BASE = (opt("--url", "http://127.0.0.1:3000") ?? "").replace(/\/$/, "");
const CONCURRENCY = Number.parseInt(opt("--concurrency", "25") ?? "25", 10);
const REQUESTS = Number.parseInt(opt("--requests", "200") ?? "200", 10);
const MAX_ERROR_RATE = Number.parseFloat(opt("--max-error-rate", "1") ?? "1");
let paths = (opt("--paths", "/api/health") ?? "/api/health").split(",");
const pathsFile = opt("--paths-file", null);
if (pathsFile) {
  paths = readFileSync(pathsFile, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}

const latencies = [];
let ok = 0;
let errors = 0;
let cursor = 0;

async function one() {
  const path = paths[cursor++ % paths.length];
  const url = `${BASE}${path}`;
  const start = process.hrtime.bigint();
  try {
    const res = await fetch(url, { redirect: "manual" });
    // Drain body so timings include transfer.
    await res.arrayBuffer().catch(() => undefined);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    latencies.push(ms);
    if (res.status >= 500) errors += 1;
    else ok += 1;
  } catch {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    latencies.push(ms);
    errors += 1;
  }
}

async function worker(n) {
  while (n-- > 0) await one();
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const t0 = Date.now();
const perWorker = Math.ceil(REQUESTS / CONCURRENCY);
await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, i) =>
    worker(i === CONCURRENCY - 1 ? REQUESTS - perWorker * i : perWorker),
  ),
);
const seconds = (Date.now() - t0) / 1000;
latencies.sort((a, b) => a - b);
const total = ok + errors;
const summary = {
  requests: total,
  ok,
  errors,
  errorRate: total === 0 ? 0 : (errors / total) * 100,
  rps: total / Math.max(seconds, 0.001),
  p50: Math.round(pct(latencies, 50) * 10) / 10,
  p95: Math.round(pct(latencies, 95) * 10) / 10,
  p99: Math.round(pct(latencies, 99) * 10) / 10,
};
console.log(JSON.stringify(summary, null, 2));
if (summary.errorRate > MAX_ERROR_RATE) {
  console.error(`LOAD_SLO_BREACH errorRate=${summary.errorRate}%`);
  process.exit(1);
}
console.log("LOAD_OK");
