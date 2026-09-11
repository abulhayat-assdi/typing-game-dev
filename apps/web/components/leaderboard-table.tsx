import Link from "next/link";
import type { LeaderboardRow } from "../lib/server/student-store";
import { getTranslator, type Locale } from "../lib/i18n";

const WINDOWS = ["today", "week", "month", "all"] as const;

/** Server-rendered board: ranks, top-3 treatment, current-user highlight. */
export function LeaderboardTable({
  locale,
  rows,
  userId,
  window,
  batchId,
}: {
  locale: Locale;
  rows: LeaderboardRow[];
  userId: string;
  window: string;
  batchId: string;
}) {
  const t = getTranslator(locale, "leaderboard");
  const label =
    window === "today"
      ? t("windowToday")
      : window === "week"
        ? t("windowWeek")
        : window === "month"
          ? t("windowMonth")
          : t("windowAll");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("title")}>
        {WINDOWS.map((w) => {
          const active = w === window;
          const text =
            w === "today"
              ? t("windowToday")
              : w === "week"
                ? t("windowWeek")
                : w === "month"
                  ? t("windowMonth")
                  : t("windowAll");
          return (
            <Link
              key={w}
              href={`/${locale}/leaderboard?window=${w}&batch=${encodeURIComponent(batchId)}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "tap-btn tap-btn-primary tap-btn-sm"
                  : "tap-btn tap-btn-secondary tap-btn-sm"
              }
            >
              {text}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {t("noRuns")} ({label})
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tap-table">
            <caption className="tap-sr-only">
              {t("title")} — {label}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("rank")}</th>
                <th scope="col">{t("player")}</th>
                <th scope="col">{t("level")}</th>
                <th scope="col">{t("xp")}</th>
                <th scope="col">{t("wpm")}</th>
                <th scope="col">{t("accuracy")}</th>
                <th scope="col">{t("streak")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const me = r.userId === userId;
                return (
                  <tr
                    key={r.userId}
                    className={
                      me ? "tap-row-me" : r.rank <= 3 ? "tap-row-top" : undefined
                    }
                  >
                    <td>
                      {r.rank <= 3 ? (
                        <span aria-hidden="true">
                          {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉"}
                        </span>
                      ) : null}{" "}
                      {r.rank}
                    </td>
                    <th scope="row">
                      {r.fullName}{" "}
                      <span className="text-ink-faint">({r.rollNumber})</span>
                      {me ? (
                        <span className="tap-badge tap-badge-primary ml-2">
                          {t("you")}
                        </span>
                      ) : null}
                    </th>
                    <td>{r.level}</td>
                    <td>{r.xpWindow}</td>
                    <td>{Math.round(r.avgWpm)}</td>
                    <td>{Math.round(r.avgAccuracy)}%</td>
                    <td>{r.streak}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
