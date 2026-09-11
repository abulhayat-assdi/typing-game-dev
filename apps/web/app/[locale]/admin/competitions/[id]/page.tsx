import { notFound } from "next/navigation";
import { isLocale } from "../../../../../lib/i18n";
import { competitionPageContext } from "../../../../../lib/server/competition-pages";
import { CompetitionManage } from "../../../../../components/competition-details";

/** Admin competition oversight: lifecycle actions + board + final results. */
export default async function AdminCompetitionManagePage({
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
    <CompetitionManage
      locale={locale}
      detail={detail}
      board={board}
      baseHref={`/${locale}/admin/competitions`}
    />
  );
}
