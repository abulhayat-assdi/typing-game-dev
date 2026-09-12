import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { seasonPageContext } from "../../../../../lib/server/season-pages";
import { SeasonBoard } from "../../../../../components/season-board";

/** Full leaderboards for the active (or latest) season. */
export default async function SeasonLeaderboardPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "seasons");
  const { store } = await seasonPageContext(locale);
  const seasons = await store.listSeasons();
  const active = seasons.find((s) => s.status === "active") ?? seasons[0] ?? null;
  if (!active) notFound();
  const [student, clan] = await Promise.all([
    store.getBoard(active.id, "student"),
    store.getBoard(active.id, "clan"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={active.name} description={active.theme} />
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionStudentBoard")}</h2>
          <SeasonBoard locale={locale} rows={student} clan={false} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionClanBoard")}</h2>
          <SeasonBoard locale={locale} rows={clan} clan={true} />
        </CardContent>
      </Card>
    </div>
  );
}
