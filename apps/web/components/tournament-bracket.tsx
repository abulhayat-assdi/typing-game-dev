import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type {
  TournamentMatchView,
  TournamentRoundView,
} from "../lib/server/tournament-store";

function sideLabel(
  side: { id: string; name: string } | null,
  tbd: string,
): string {
  return side ? side.name : tbd;
}

/** One bracket match card: round, sides, score, status, winner. */
export function TournamentMatchCard({
  locale,
  match,
  highlightId,
}: {
  locale: Locale;
  match: TournamentMatchView;
  highlightId?: string | null | undefined;
}) {
  const t = getTranslator(locale, "tournaments");
  const isBye = match.status === "bye";
  const winner = match.winnerId;
  const mine =
    highlightId !== null &&
    highlightId !== undefined &&
    (match.participantA?.id === highlightId ||
      match.participantB?.id === highlightId);
  return (
    <div
      className={`tap-match-card${mine ? " tap-match-card-mine" : ""}`}
      data-status={match.status}
    >
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          {match.roundName} · {t("round")} {match.roundNo}
        </span>
        <span className="tap-badge">{isBye ? t("bye") : match.status}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-sm">
        <span className={winner === match.participantA?.id ? "font-bold" : ""}>
          {sideLabel(match.participantA, t("tbd"))}
        </span>
        <span className="font-mono">
          {match.scoreA ?? "–"} {t("vs")} {match.scoreB ?? "–"}
        </span>
        <span className={winner === match.participantB?.id ? "font-bold" : ""}>
          {sideLabel(match.participantB, t("tbd"))}
        </span>
      </div>
      {winner ? (
        <p className="mt-1 text-xs">
          {t("winner")}:{" "}
          {match.participantA?.id === winner
            ? sideLabel(match.participantA, t("tbd"))
            : sideLabel(match.participantB, t("tbd"))}
          {match.tieBreak ? ` (${match.tieBreak})` : ""}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Visual bracket in the game/adventure language (cards, badges, round
 * columns — not a plain sports table). Desktop renders a horizontal
 * round-by-round tree; small screens stack rounds vertically via the
 * same markup (CSS scroll-snap columns).
 */
export function TournamentBracket({
  locale,
  rounds,
  highlightId,
}: {
  locale: Locale;
  rounds: TournamentRoundView[];
  highlightId?: string | null;
}) {
  const t = getTranslator(locale, "tournaments");
  if (rounds.length === 0) {
    return <p className="text-sm text-ink-muted">{t("noTournaments")}</p>;
  }
  return (
    <div className="tap-bracket" role="tree" aria-label={t("sectionBracket")}>
      {rounds.map((round) => (
        <section key={round.roundNo} className="tap-bracket-round" role="treeitem">
          <h3 className="mb-2 text-sm font-bold">
            {round.name} · {t("round")} {round.roundNo}
          </h3>
          <div className="flex flex-col gap-3">
            {round.matches.map((m) => (
              <TournamentMatchCard
                key={m.id}
                locale={locale}
                match={m}
                highlightId={highlightId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Final standings table (1st/2nd/tied 3rd after finalization). */
export function TournamentResults({
  locale,
  results,
}: {
  locale: Locale;
  results: { participantId: string; displayName: string; placement: number }[];
}) {
  const t = getTranslator(locale, "tournaments");
  if (results.length === 0) return null;
  return (
    <Card>
      <CardContent>
        <h2 className="mb-2 text-base font-bold">{t("sectionResults")}</h2>
        <table className="tap-table">
          <thead>
            <tr>
              <th scope="col">{t("placement")}</th>
              <th scope="col">{t("participants")}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.participantId}>
                <td>
                  {r.placement}
                  {r.placement === 1 ? ` · ${t("champion")}` : ""}
                </td>
                <td>{r.displayName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
