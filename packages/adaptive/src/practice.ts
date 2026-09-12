/**
 * Personal practice generator (M15). Selects drill content ONLY from
 * caller-supplied curated lists (the content engine's items, passed in
 * by the web layer from @tap/content) — never synthesized, never
 * unsafe. Letters drills use letter sets; word/sentence drills pick
 * items containing the weak keys, progressively harder by item length.
 */
export interface PracticeDrill {
  kind: "letters" | "words" | "sentences";
  targetKeys: string[];
  items: string[];
  durationMinutes: number;
}

function containsWeakKey(item: string, weakKeys: Set<string>): boolean {
  const lower = item.toLowerCase();
  for (const k of weakKeys) {
    if (k.length === 1 && lower.includes(k.toLowerCase())) return true;
  }
  return false;
}

export function selectDrillWords(
  weakKeys: string[],
  words: readonly string[],
  count = 12,
): string[] {
  const weak = new Set(weakKeys.filter((k) => k.length === 1));
  if (weak.size === 0) return [];
  const hits = words.filter((w) => containsWeakKey(w, weak));
  // Progressive: shorter (easier) words first, stable for ties.
  hits.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  // Cover each weak key at least once before repeating items.
  const picked: string[] = [];
  const remaining = [...hits];
  for (const k of weak) {
    const idx = remaining.findIndex((w) =>
      w.toLowerCase().includes(k.toLowerCase()),
    );
    if (idx >= 0) {
      picked.push(remaining[idx] as string);
      remaining.splice(idx, 1);
    }
    if (picked.length >= count) break;
  }
  for (const w of remaining) {
    if (picked.length >= count) break;
    picked.push(w);
  }
  return picked.slice(0, Math.max(count, 1));
}

export function selectDrillSentences(
  weakKeys: string[],
  sentences: readonly string[],
  count = 4,
): string[] {
  const weak = new Set(weakKeys.filter((k) => k.length === 1));
  if (weak.size === 0) return [];
  return sentences
    .filter((s) => containsWeakKey(s, weak))
    .sort((a, b) => a.length - b.length || (a < b ? -1 : 1))
    .slice(0, Math.max(count, 1));
}

export function buildPracticeDrill(
  weakKeys: string[],
  source: { words: readonly string[]; sentences: readonly string[] },
): PracticeDrill | null {
  const keys = weakKeys.filter((k) => k.length === 1).slice(0, 4);
  if (keys.length === 0) return null;
  const words = selectDrillWords(keys, source.words);
  if (words.length > 0) {
    return { kind: "words", targetKeys: keys, items: words, durationMinutes: 5 };
  }
  const sentences = selectDrillSentences(keys, source.sentences);
  if (sentences.length > 0) {
    return { kind: "sentences", targetKeys: keys, items: sentences, durationMinutes: 5 };
  }
  return { kind: "letters", targetKeys: keys, items: keys, durationMinutes: 3 };
}
