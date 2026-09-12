import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { tournamentPageContext } from "../../../../../lib/server/tournament-pages";
import { TournamentAdminActions } from "../../../../../components/tournament-admin-actions";
import { TournamentBracket } from "../../../../../components/tournament-bracket";

/** Admin tournament management: lifecycle, seeding, rounds, finalize. */
export default async function AdminTournamentManagePage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "tournaments");
  const { session, store } = await tournamentPageContext(locale);
  const detail = await store.getTournament(params.id, session.userId);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.name}
        description={`${detail.slug} · ${detail.status}`}
      />
      <Card>
        <CardContent>
          <TournamentAdminActions
            locale={locale}
            tournamentId={detail.id}
            status={detail.status}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">
            {t("participants")}: {detail.participantCount}
          </h2>
          <p className="text-sm text-ink-muted">
            {detail.participantType === "clan" ? t("typeClan") : t("typeStudent")} ·{" "}
            {detail.format}
          </p>
        </CardContent>
      </Card>
      <TournamentBracket
        locale={locale}
        rounds={detail.rounds}
        highlightId={null}
      />
    </div>
  );
}
