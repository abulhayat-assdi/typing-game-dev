import Link from "next/link";
import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { tournamentPageContext } from "../../../../lib/server/tournament-pages";
import { TournamentCard } from "../../../../components/tournament-card";

/** Student tournament hub: live cups first, history below. */
export default async function TournamentsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "tournaments");
  const { store } = await tournamentPageContext(locale);
  const tournaments = await store.listTournaments();
  const live = tournaments.filter((s) => s.status !== "finalized");
  const history = tournaments.filter((s) => s.status === "finalized");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("hubTitle")} description={t("hubSubtitle")} />
      {tournaments.length === 0 ? (
        <EmptyState title={t("hubTitle")} description={t("noTournaments")} />
      ) : null}
      <div className="flex flex-col gap-3">
        {live.map((s) => (
          <TournamentCard
            key={s.id}
            locale={locale}
            tournament={s}
            href={`/${locale}/tournaments/${s.id}`}
          />
        ))}
      </div>
      {history.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-bold">{t("sectionHistory")}</h2>
          {history.map((s) => (
            <TournamentCard
              key={s.id}
              locale={locale}
              tournament={s}
              href={`/${locale}/tournaments/${s.id}`}
            />
          ))}
        </div>
      ) : null}
      <p className="text-xs text-ink-muted">
        <Link href={`/${locale}/dashboard`} className="hover:underline">
          dashboard
        </Link>
      </p>
    </div>
  );
}
