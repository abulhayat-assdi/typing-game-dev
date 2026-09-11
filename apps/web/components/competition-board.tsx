import { getTranslator, type Locale } from "../lib/i18n";
import type { LeaderboardRow } from "../lib/server/competition-store";

/**
 * Server-derived competition board. Rows come from fn_competition_leaderboard
 * (public fields only); the caller's row is highlighted via is_me.
 */
export function CompetitionBoard({
  locale,
  rows,
}: {
  locale: Locale;
  rows: LeaderboardRow[];
}) {
  const t = getTranslator(locale, "competitions");
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">{t("emptySection")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tap-table">
        <thead>
          <tr>
            <th scope="col">{t("boardRank")}</th>
            <th scope="col">{t("boardPlayer")}</th>
            <th scope="col">{t("boardBatch")}</th>
            <th scope="col">{t("boardScore")}</th>
            <th scope="col">{t("boardWpm")}</th>
            <th scope="col">{t("boardAccuracy")}</th>
            <th scope="col">{t("boardAttempts")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank} className={r.isMe ? "tap-row-mine" : undefined}>
              <td>{r.rank}</td>
              <td>{r.displayName}</td>
              <td>{r.batchTitle || "—"}</td>
              <td>{r.score}</td>
              <td>{r.wpm}</td>
              <td>{r.accuracy}%</td>
              <td>{r.attempts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
