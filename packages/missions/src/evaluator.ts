/**
 * Mission progress evaluator (M9). Pure function over validated activity —
 * same semantics as fn_eval_objective in 0018 (count/sum/max/min,
 * accuracy/WPM/score thresholds, worlds, games, windows). The client must
 * never report completion; this runs server-side or in tests only.
 *
 * COMBO_TARGET has no server signal yet (combo is not persisted) and always
 * evaluates incomplete — documented extension point, never a false pass.
 */
import type {
  MissionObjective,
  MissionProgress,
  ObjectiveProgress,
  ValidatedActivity,
} from "./types";

export function evaluateMissionProgress(
  objectives: MissionObjective[],
  activities: ValidatedActivity[],
  window: { from: string; to: string },
): MissionProgress {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const inWindow = activities.filter((a) => {
    const t = Date.parse(a.submittedAt);
    return (
      Number.isFinite(t) &&
      (Number.isNaN(from) || t >= from) &&
      (Number.isNaN(to) || t < to)
    );
  });
  const list = [...objectives].sort((a, b) => a.position - b.position);
  const evaluated = list.map((o) =>
    evaluateObjective(o, inWindow),
  );
  const done = evaluated.filter((o) => o.completed).length;
  return {
    objectives: evaluated,
    done,
    total: evaluated.length,
    completed: evaluated.length > 0 && done === evaluated.length,
  };
}

function scoped(
  acts: ValidatedActivity[],
  games?: string[],
  worlds?: string[],
): ValidatedActivity[] {
  return acts.filter(
    (a) =>
      (!games || games.length === 0 || games.includes(a.gameSlug)) &&
      (!worlds || worlds.length === 0 || worlds.includes(a.worldId)),
  );
}

function evaluateObjective(
  o: MissionObjective,
  acts: ValidatedActivity[],
): ObjectiveProgress {
  const base = scoped(acts, o.target.games, o.target.worlds);
  const missing: string[] = [];
  let current = 0;
  let target = 1;
  switch (o.kind) {
    case "GAMES_COMPLETED":
      target = o.target.count ?? 1;
      current = base.length;
      break;
    case "ACCURACY_REACHED":
      target = o.target.threshold ?? 1;
      current = base.reduce((m, a) => Math.max(m, a.accuracy), 0);
      break;
    case "WPM_REACHED":
      target = o.target.threshold ?? 1;
      current = base.reduce((m, a) => Math.max(m, a.effectiveWpm), 0);
      break;
    case "SCORE_REACHED":
      target = o.target.threshold ?? 1;
      current =
        o.target.mode === "sum"
          ? base.reduce((s, a) => s + a.score, 0)
          : base.reduce((m, a) => Math.max(m, a.score), 0);
      break;
    case "CHARS_TYPED":
      target = o.target.count ?? 1;
      current = base.reduce((s, a) => s + a.correctCharacters, 0);
      break;
    case "WORDS_TYPED":
      target = o.target.count ?? 1;
      current = base.reduce((s, a) => s + a.completedWords, 0);
      break;
    case "PERFECT_RUN":
      target = o.target.count ?? 1;
      current = base.filter((a) => a.incorrectCharacters === 0).length;
      break;
    case "DISTINCT_GAMES":
      target = o.target.count ?? 1;
      current = new Set(base.map((a) => a.gameSlug)).size;
      break;
    case "PERSONAL_BEST":
      target = o.target.count ?? 1;
      current = base.filter((a) => a.isPersonalBest === true).length;
      break;
    case "WORLD_GAMES":
      target = o.target.count ?? 1;
      current = base.length;
      break;
    default:
      missing.push("UNSUPPORTED_KIND");
      break;
  }
  const completed = missing.length === 0 && current >= target;
  if (!completed && missing.length === 0) {
    missing.push(`NEED_${String(target - current)}_MORE`);
  }
  return { position: o.position, kind: o.kind, current, target, completed, missing };
}
