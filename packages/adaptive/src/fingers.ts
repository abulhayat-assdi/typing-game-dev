/**
 * Finger analysis (M15). Standard QWERTY touch-typing map; finger stats
 * aggregate key stats, so finger weaknesses always trace back to key
 * evidence (never invented).
 */
import type { FingerName } from "./types";
import { classifyKey, keyAccuracy } from "./keys";

const ROW_FINGERS: Record<string, FingerName[]> = {
  number: [
    "left_pinky", "left_ring", "left_middle", "left_index", "left_index",
    "right_index", "right_index", "right_middle", "right_ring", "right_pinky",
  ],
  top: [
    "left_pinky", "left_ring", "left_middle", "left_index", "left_index",
    "right_index", "right_index", "right_middle", "right_ring", "right_pinky",
  ],
  home: [
    "left_pinky", "left_ring", "left_middle", "left_index", "left_index",
    "right_index", "right_index", "right_middle", "right_ring", "right_pinky",
  ],
  bottom: [
    "left_pinky", "left_ring", "left_middle", "left_index", "left_index",
    "right_index", "right_index", "right_middle", "right_ring", "right_pinky",
  ],
};

const ROWS: Record<string, string> = {
  number: "`1234567890-=",
  top: "qwertyuiop[]",
  home: "asdfghjkl;'",
  bottom: "zxcvbnm,./",
};

/** Expected finger for a key (case-insensitive base position). */
export function fingerFor(key: string): FingerName | null {
  const lower = key.toLowerCase();
  if (lower === " ") return "left_thumb";
  for (const [row, chars] of Object.entries(ROWS)) {
    const idx = chars.indexOf(lower);
    if (idx >= 0) {
      const fingers = ROW_FINGERS[row] as FingerName[];
      return fingers[Math.min(idx, fingers.length - 1)] as FingerName;
    }
  }
  return null;
}

export interface FingerStat {
  finger: FingerName;
  exposures: number;
  errors: number;
  accuracy: number;
  state: ReturnType<typeof classifyKey>;
}

export function aggregateFingers(
  keys: { key: string; exposures: number; errors: number }[],
): FingerStat[] {
  const byFinger = new Map<FingerName, { exposures: number; errors: number }>();
  for (const k of keys) {
    const f = fingerFor(k.key);
    if (!f) continue;
    const cur = byFinger.get(f) ?? { exposures: 0, errors: 0 };
    cur.exposures += k.exposures;
    cur.errors += k.errors;
    byFinger.set(f, cur);
  }
  return [...byFinger.entries()].map(([finger, s]) => ({
    finger,
    exposures: s.exposures,
    errors: s.errors,
    accuracy: keyAccuracy(s.exposures, s.errors),
    state: classifyKey(s.exposures, s.errors),
  }));
}
