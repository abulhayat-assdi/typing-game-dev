import Link from "next/link";
import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type { TournamentSummary } from "../lib/server/tournament-store";

/** Tournament list card: theme, format, status, contestant type. */
export function TournamentCard({
  locale,
  tournament,
  href,
}: {
  locale: Locale;
  tournament: TournamentSummary;
  href: string;
}) {
  const t = getTranslator(locale, "tournaments");
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href={href} className="text-base font-bold hover:underline">
              {tournament.name}
            </Link>
            <p className="text-sm text-ink-muted">
              {tournament.theme.length > 0 ? `${tournament.theme} · ` : ""}
              {tournament.participantType === "clan" ? t("typeClan") : t("typeStudent")}
            </p>
          </div>
          <span className="tap-badge">{tournament.status}</span>
        </div>
      </CardContent>
    </Card>
  );
}
