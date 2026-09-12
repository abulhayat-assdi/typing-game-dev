import { getTranslator, type Locale } from "../lib/i18n";
import type { SeasonBoardRow } from "../lib/server/season-store";

/** Season leaderboard table (students or clans, server-ranked). */
export function SeasonBoard({
  locale,
  rows,
  clan,
}: {
  locale: Locale;
  rows: SeasonBoardRow[];
  clan: boolean;
}) {
  const t = getTranslator(locale, "seasons");
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">{t("emptyBoard")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tap-table">
        <thead>
          <tr>
            <th scope="col">{t("colRank")}</th>
            <th scope="col">{clan ? t("colClan") : t("colPlayer")}</th>
            <th scope="col">{t("colPoints")}</th>
            <th scope="col">{t("colTier")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.participantId}>
              <td>{r.rank}</td>
              <td>{r.displayName}</td>
              <td>{r.points}</td>
              <td>{r.tier ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
