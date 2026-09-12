/**
 * Season definition validation (M13). Mirrors the 0027/0028 constraints;
 * the database re-validates on write.
 */
export interface SeasonDefinitionInput {
  slug: string;
  name: string;
  startAt: string;
  endAt: string;
  tiers?: { tier: string; minPoints: number; minRank?: number }[];
}

const SLUG = /^[a-z0-9-]{1,80}$/;

export function validateSeasonDefinition(
  def: SeasonDefinitionInput,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!SLUG.test(def.slug)) errors.push("MALFORMED_SLUG");
  if (!def.name || def.name.length > 160) errors.push("MALFORMED_NAME");
  const start = Date.parse(def.startAt);
  const end = Date.parse(def.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    errors.push("INVALID_WINDOW");
  }
  const seen = new Set<string>();
  for (const t of def.tiers ?? []) {
    if (!t.tier) errors.push("MALFORMED_TIER");
    if (seen.has(t.tier)) errors.push("DUPLICATE_TIER");
    seen.add(t.tier);
    if (!Number.isInteger(t.minPoints) || t.minPoints < 0) {
      errors.push("INVALID_TIER_POINTS");
    }
  }
  return { ok: errors.length === 0, errors };
}

const TRANSITIONS: Record<string, ReadonlySet<string> | undefined> = {
  draft: new Set(["scheduled", "cancelled"]),
  scheduled: new Set(["active", "cancelled"]),
  active: new Set(["processing", "cancelled"]),
  processing: new Set(["finalized"]),
  finalized: new Set(),
  cancelled: new Set(),
};

export function canTransitionSeasonStatus(from: string, to: string): boolean {
  return TRANSITIONS[from]?.has(to) ?? false;
}
