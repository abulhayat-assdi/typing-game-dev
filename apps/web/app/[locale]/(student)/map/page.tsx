import Link from "next/link";
import { AdventureMapContainer, Badge, PageHeader, WorldCard } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { studentContext } from "../../../../lib/server/student-pages";
import { recommendGame } from "../../../../lib/server/student";
import { getWorldMapData } from "../../../../lib/server/games";

export default async function MapPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "map");
  const { session, store } = await studentContext(locale);

  const [games, unlocks, completed] = await Promise.all([
    store.listGames(),
    store.listUnlocks(session.userId),
    store.listCompletedGames(session.userId),
  ]);
  const recommended = recommendGame(games, unlocks, completed);
  const worlds = await getWorldMapData(
    session.userId,
    store,
    recommended?.slug ?? null,
  );

  const statusTone = (s: string): string =>
    s === "complete" ? t("complete") : s === "current" ? t("current") : t("locked");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdventureMapContainer label={t("title")}>
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {worlds.map((w, i) => (
            <WorldCard
              key={w.slug}
              title={`${String(i + 1)}. ${locale === "bn" ? w.nameBn : w.nameEn}`}
              description={locale === "bn" && w.descriptionBn ? w.descriptionBn : w.descriptionEn}
              status={w.status === "open" ? "current" : w.status}
              statusLabel={statusTone(w.status)}
              progress={
                w.total === 0 ? 0 : Math.round((w.completed / w.total) * 100)
              }
              action={
                w.nextGameSlug ? (
                  <Link
                    href={`/${locale}/games/${w.nextGameSlug}`}
                    className="tap-btn tap-btn-secondary tap-btn-sm"
                  >
                    {t("nextGame")}
                  </Link>
                ) : (
                  <Badge tone="neutral">
                    {t("gamesCompleted")
                      .replace("{done}", String(w.completed))
                      .replace("{total}", String(w.total))}
                  </Badge>
                )
              }
            />
          ))}
        </div>
      </AdventureMapContainer>
    </div>
  );
}
