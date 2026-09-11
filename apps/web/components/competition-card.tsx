import Link from "next/link";
import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import {
  formatDateTime,
  rewardSummary,
  statusKey,
  type CompetitionSection,
} from "../lib/competitions";
import type { CompetitionCard as CardData } from "../lib/server/competition-store";

/** Competition summary card used on hub + staff lists. */
export function CompetitionCard({
  locale,
  competition,
  href,
  section,
}: {
  locale: Locale;
  competition: CardData;
  href: string;
  section: CompetitionSection;
}) {
  const t = getTranslator(locale, "competitions");
  const rewards = rewardSummary(
    competition.rewardPreview,
    t("fieldWinnerXp"),
    t("fieldParticipationXp"),
  );
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold">
            <Link href={href}>{competition.title}</Link>
          </h3>
          <span className="tap-badge">{t(statusKey(competition.status))}</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {competition.type} ·{" "}
          {t("cardGame", { game: competition.gameSlugs[0] ?? "—" })}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {section === "completed"
            ? t("cardEnds", {
                date: formatDateTime(competition.endsAt, locale),
              })
            : t("cardStarts", {
                date: formatDateTime(competition.startsAt, locale),
              })}
          {" · "}
          {t("cardAttempts", { count: competition.attemptLimit })}
        </p>
        {rewards ? <p className="mt-1 text-sm">{rewards}</p> : null}
      </CardContent>
    </Card>
  );
}
