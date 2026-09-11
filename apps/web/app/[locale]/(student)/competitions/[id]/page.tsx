import { notFound } from "next/navigation";
import { isLocale } from "../../../../../lib/i18n";
import { competitionPageContext } from "../../../../../lib/server/competition-pages";
import { CompetitionDetails } from "../../../../../components/competition-details";

/**
 * Student competition details. Everything shown is server-authoritative:
 * detail + own entry (RLS), server-derived board, server clock for the
 * countdown anchor. Live entry reuses the game play route (no second
 * runtime); attaching the validated attempt happens via the API.
 */
export default async function CompetitionDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const { session, store } = await competitionPageContext(locale);
  const detail = await store.getCompetition(params.id, session.userId);
  if (!detail) notFound();
  const board = await store.getLeaderboard(detail.id);

  return (
    <CompetitionDetails
      locale={locale}
      detail={detail}
      board={board}
      serverNowIso={new Date().toISOString()}
      gameSlug={detail.gameSlugs[0] ?? null}
    />
  );
}
