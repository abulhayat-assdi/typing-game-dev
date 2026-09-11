import { notFound } from "next/navigation";
import { Badge, Card, CardContent, LockedGameCard, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { studentContext } from "../../../../../lib/server/student-pages";
import { getGameDetails } from "../../../../../lib/server/games";
import { PlayButton } from "../../../../../components/play-button";

export default async function GameDetailPage({
  params,
}: {
  params: { locale: string; gameSlug: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "games");
  const { session, store } = await studentContext(locale);
  const game = await getGameDetails(session.userId, params.gameSlug, store);
  if (!game) notFound();

  const title = locale === "bn" && game.titleBn ? game.titleBn : game.titleEn;

  if (!game.unlocked) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <PageHeader title={title} description={game.descriptionEn} />
        <LockedGameCard
          title={title}
          whyLocked={game.lockedReasons}
          action={
            <div className="flex flex-wrap gap-2">
              <Badge tone="warning">{t("lockedReason")}</Badge>
              <Badge tone="neutral">{game.difficulty}</Badge>
              <Badge tone="neutral">{game.mode}</Badge>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={title}
        description={game.descriptionEn}
        actions={
          <div className="flex gap-1">
            <Badge tone="neutral">{game.difficulty}</Badge>
            <Badge tone="neutral">{game.mode}</Badge>
            {game.completed ? (
              <Badge tone="success">{t("statusCompleted")}</Badge>
            ) : null}
            {game.bestScore !== null ? (
              <Badge tone="primary">
                {t("bestScore")}: {game.bestScore}
              </Badge>
            ) : null}
          </div>
        }
      />
      <Card>
        <CardContent>
          <PlayButton
            gameSlug={game.slug}
            locale={locale}
            strings={{
              play: t("play"),
              starting: t("starting"),
              failed: t("startFailed"),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
