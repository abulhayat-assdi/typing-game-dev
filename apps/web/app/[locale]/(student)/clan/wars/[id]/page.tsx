import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../../lib/i18n";
import { warPageContext } from "../../../../../../lib/server/war-pages";
import { WarBoard } from "../../../../../../components/war-board";
import { WarActions } from "../../../../../../components/war-actions";
import { CompetitionCountdown } from "../../../../../../components/competition-countdown";
import { PlayButton } from "../../../../../../components/play-button";

/**
 * War detail: status-appropriate actions, server-anchored countdowns,
 * allowed games, attempts, personal contribution, privacy-safe board.
 * Typing reuses PlayButton (same M4/M6 runtime); submission binds the
 * latest validated attempt via the API.
 */
export default async function WarDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "wars");
  const tg = getTranslator(locale, "games");
  const { session, store } = await warPageContext(locale);
  const war = await store.getWar(params.id);
  if (!war) notFound();
  const board = await store.getBoard(war.id);
  const serverNow = new Date().toISOString();
  const gameSlug = war.gameSlugs[0] ?? null;
  const latest = gameSlug
    ? await store.getLatestValidAttempt(gameSlug, session.userId)
    : null;

  const staffActions: ("dispatch" | "cancel" | "advance" | "sync" | "finalize")[] = [];
  if (war.status === "challenge_sent") staffActions.push("dispatch");
  if (
    war.status === "accepted" ||
    war.status === "preparation" ||
    war.status === "live"
  ) {
    staffActions.push("advance", "sync");
  }
  if (war.status === "processing") staffActions.push("finalize");
  if (
    war.status !== "finalized" &&
    war.status !== "processing" &&
    war.status !== "live"
  ) {
    staffActions.push("cancel");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("versus", {
          a: war.challengerName || "—",
          b: war.defenderName || "—",
        })}
        description={war.status}
      />

      {(war.status === "preparation" && war.battleStart) ||
      (war.status === "accepted" && war.battleStart) ? (
        <CompetitionCountdown
          serverNowIso={serverNow}
          targetIso={war.battleStart}
          label={t("startsIn", { time: "" }).replace(/:\s*$/, "")}
        />
      ) : null}
      {war.status === "live" && war.battleEnd ? (
        <CompetitionCountdown
          serverNowIso={serverNow}
          targetIso={war.battleEnd}
          label={t("endsIn", { time: "" }).replace(/:\s*$/, "")}
        />
      ) : null}
      <p className="text-xs text-ink-muted">{t("serverTimeNote")}</p>

      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("allowedGames")}</h2>
          <p className="text-sm">{war.gameSlugs.join(", ") || "—"}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {t("attemptsLeft", {
              left: Math.max(war.attemptsPerPlayer - war.myAttempts, 0),
              limit: war.attemptsPerPlayer,
            })}
            {" · "}
            {t("myContribution", { score: war.myContribution })}
          </p>
        </CardContent>
      </Card>

      {war.status === "pending_response" ? (
        <WarActions locale={locale} warId={war.id} actions={["accept", "decline"]} />
      ) : null}
      {staffActions.length > 0 ? (
        <WarActions locale={locale} warId={war.id} actions={staffActions} />
      ) : null}

      {war.status === "live" && gameSlug ? (
        <Card>
          <CardContent>
            <div className="flex flex-col gap-3">
              <PlayButton
                gameSlug={gameSlug}
                locale={locale}
                strings={{
                  play: tg("play"),
                  starting: tg("starting"),
                  failed: tg("startFailed"),
                }}
              />
              {latest ? (
                <WarActions
                  locale={locale}
                  warId={war.id}
                  actions={["submit"]}
                  attemptId={latest.id}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <WarBoard locale={locale} rows={board} />
        </CardContent>
      </Card>

      {war.status === "finalized" ? (
        <p className="text-sm text-ink-muted">{t("resultsFinal")}</p>
      ) : null}
    </div>
  );
}
