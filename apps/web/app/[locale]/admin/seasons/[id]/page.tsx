import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { seasonPageContext } from "../../../../../lib/server/season-pages";
import { SeasonAdminActions } from "../../../../../components/season-admin-actions";
import { SeasonBoard } from "../../../../../components/season-board";

/** Admin season management: lifecycle, sources, tiers, boards. */
export default async function AdminSeasonManagePage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "seasons");
  const { store } = await seasonPageContext(locale);
  const seasons = await store.listSeasons();
  const row = seasons.find((s) => s.id === params.id);
  if (!row) notFound();
  const [student, clan] = await Promise.all([
    store.getBoard(row.id, "student"),
    store.getBoard(row.id, "clan"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={row.name} description={`${row.slug} · ${row.status}`} />
      <Card>
        <CardContent>
          <SeasonAdminActions
            locale={locale}
            seasonId={row.id}
            status={row.status}
          />
        </CardContent>
      </Card>
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
