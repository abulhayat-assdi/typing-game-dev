import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { tournamentPageContext } from "../../../../../lib/server/tournament-pages";
import {
  TournamentBracket,
  TournamentResults,
} from "../../../../../components/tournament-bracket";
import { TournamentActions } from "../../../../../components/tournament-actions";

/**
 * Student tournament detail: theme, registration, bracket, my match,
 * results, rewards note. Never exposes admin controls.
 */
export default async function TournamentDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "tournaments");
  const { session, store } = await tournamentPageContext(locale);
  const detail = await store.getTournament(params.id, session.userId);
  if (!detail) notFound();

  const registered = detail.myStatus === "active";
  const open = detail.status === "registration_open";
  const myMatches = detail.rounds.flatMap((r) =>
    r.matches.filter(
      (m) =>
        detail.myParticipantId !== null &&
        (m.participantA?.id === detail.myParticipantId ||
          m.participantB?.id === detail.myParticipantId) &&
        m.status !== "finalized" &&
        m.status !== "bye",
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.name}
        description={`${detail.theme.length > 0 ? `${detail.theme} · ` : ""}${detail.status}`}
      />
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionDetails")}</h2>
          <p className="text-sm text-ink-muted">{detail.description}</p>
          <p className="mt-2 text-sm">
            {t("participants")}: {detail.participantCount} ·{" "}
            {detail.participantType === "clan" ? t("typeClan") : t("typeStudent")}
          </p>
          <div className="mt-3">
            <TournamentActions
              locale={locale}
              tournamentId={detail.id}
              registered={registered}
              open={open}
            />
          </div>
        </CardContent>
      </Card>
      {myMatches.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-base font-bold">{t("sectionMyMatch")}</h2>
            <TournamentBracket
              locale={locale}
              rounds={detail.rounds.map((r) => ({
                ...r,
                matches: r.matches.filter((m) => myMatches.some((x) => x.id === m.id)),
              }))}
              highlightId={detail.myParticipantId}
            />
          </CardContent>
        </Card>
      ) : null}
      <TournamentBracket
        locale={locale}
        rounds={detail.rounds}
        highlightId={detail.myParticipantId}
      />
      <TournamentResults locale={locale} results={detail.results} />
      {detail.status === "finalized" ? (
        <p className="text-xs text-ink-muted">{t("finalizedNotice")}</p>
      ) : null}
    </div>
  );
}
