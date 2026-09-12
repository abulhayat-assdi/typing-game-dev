import { getTranslator, type Locale } from "../lib/i18n";
import type { WarBoardRow } from "../lib/server/war-store";

/** War scoreboard: clan totals first, then permitted member rows. */
export function WarBoard({
  locale,
  rows,
}: {
  locale: Locale;
  rows: WarBoardRow[];
}) {
  const t = getTranslator(locale, "wars");
  const totals = rows.filter((r) => r.scope !== "member");
  const members = rows.filter((r) => r.scope === "member");
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">{t("emptySection")}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="tap-table" aria-label={t("boardClans")}>
          <thead>
            <tr>
              <th scope="col">{t("colClan")}</th>
              <th scope="col">{t("colScore")}</th>
              <th scope="col">{t("colAttempts")}</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((r) => (
              <tr key={`${r.scope}-${r.clanId}`}>
                <td>{r.displayName}</td>
                <td>{r.score}</td>
                <td>{r.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {members.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="tap-table" aria-label={t("boardMembers")}>
            <thead>
              <tr>
                <th scope="col">{t("colPlayer")}</th>
                <th scope="col">{t("colScore")}</th>
                <th scope="col">{t("colAttempts")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((r) => (
                <tr
                  key={`${r.clanId}-${r.displayName}`}
                  className={r.isMe ? "tap-row-mine" : undefined}
                >
                  <td>{r.displayName}</td>
                  <td>{r.score}</td>
                  <td>{r.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
