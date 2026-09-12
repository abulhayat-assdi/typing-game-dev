import Link from "next/link";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { seasonPageContext } from "../../../../../lib/server/season-pages";

/** Season history: every visible season with its final status. */
export default async function SeasonHistoryPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "seasons");
  const { store } = await seasonPageContext(locale);
  const seasons = await store.listSeasons();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("sectionHistory")} description={t("hubSubtitle")} />
      <Card>
        <CardContent>
          {seasons.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptyBoard")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {seasons.map((s) => (
                <li key={s.id}>
                  <Link href={`/${locale}/season/${s.id}`}>
                    {s.name} · {s.status}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
