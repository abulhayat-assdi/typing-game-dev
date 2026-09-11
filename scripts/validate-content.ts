// Content validator stub (M1). Full JSON-schema + zod validation of
// worlds/games/badges/missions lands in M4 with packages/content.
const gameCatalogs = [
  "Phase 1: 86 games (spec §21)",
  "Phase 2: 86 games (spec §10)",
  "Phase 3: 73 events (spec §10)",
];

console.log("validate-content OK (M1 stub) — catalogs reserved:");
for (const c of gameCatalogs) console.log(`  - ${c}`);
