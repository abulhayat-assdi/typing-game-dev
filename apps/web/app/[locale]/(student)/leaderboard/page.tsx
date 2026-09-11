import { Alert, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { studentContext } from "../../../../lib/server/student-pages";
import {
  BoardAccessError,
  getBatchLeaderboard,
} from "../../../../lib/server/student";
import { LeaderboardTable } from "../../../../components/leaderboard-table";

const WINDOWS = ["today", "week", "month", "all"] as const;

/** Batch board. The fn enforces membership — a forged batch param 403s here. */
export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { window?: string; batch?: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "leaderboard");
  const { session, store } = await studentContext(locale);

  const window = WINDOWS.includes(searchParams.window as never)
    ? (searchParams.window as (typeof WINDOWS)[number])
    : "all";

  try {
    const board = await getBatchLeaderboard(session.userId, store, {
      batchId: searchParams.batch,
      window,
    });
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <LeaderboardTable
          locale={locale}
          rows={board.rows}
          userId={session.userId}
          window={board.window}
          batchId={board.batchId}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof BoardAccessError) {
      return (
        <Alert tone="warning" title={t("title")}>
          {t("raiseError")}
        </Alert>
      );
    }
    throw err;
  }
}
