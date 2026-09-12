import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader, ProgressBar } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../../lib/i18n";
import { bossPageContext } from "../../../../../../lib/server/boss-pages";
import { BossHpBar } from "../../../../../../components/boss-hp-bar";
import { BossStrikeButton } from "../../../../../../components/boss-strike-button";
import { CompetitionCountdown } from "../../../../../../components/competition-countdown";
import { PlayButton } from "../../../../../../components/play-button";
import { userDbClient } from "../../../../../../lib/server/auth";
import { createSupabaseStudentStore } from "../../../../../../lib/server/student-store";

/**
 * Boss fight screen: HP + phase, countdown, PlayButton (same M4/M6
 * runtime), strike binding, contribution board, activity feed, results.
 */
export default async function BossFightPage({
  params,
}: {
  params: { locale: string; instanceId: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "bosses");
  const tg = getTranslator(locale, "games");
  const { session, store } = await bossPageContext(locale);
  const state = await store.getState(params.instanceId);
  if (!state) notFound();
  const phase = state.phases.find(
    (p) => p.position === state.instance.currentPhase,
  );
  const client = await userDbClient();
  const games = client
    ? await createSupabaseStudentStore(client).listGames()
    : [];
  const gameSlug = games[0]?.slug ?? null;
  const latest =
    client && gameSlug
      ? await store.getLatestValidAttempt(gameSlug, session.userId)
      : null;
  const serverNow = new Date().toISOString();
  const finished =
    state.instance.status === "finalized" ||
    state.instance.status === "defeated" ||
    state.instance.status === "expired";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={state.boss.name} description={state.boss.lore} />
      <BossHpBar
        locale={locale}
        currentHp={state.instance.currentHp}
        maxHp={state.instance.initialHp}
        phaseName={
          phase
            ? t("phaseLabel", { position: phase.position + 1, name: phase.name })
            : ""
        }
      />
      {state.instance.endAt && state.instance.status === "active" ? (
        <>
          <CompetitionCountdown
            serverNowIso={serverNow}
            targetIso={state.instance.endAt}
            label={t("timeLeft", { time: "" }).replace(/:\s*$/, "")}
          />
          <p className="text-xs text-ink-muted">{t("serverTimeNote")}</p>
        </>
      ) : null}

      {state.instance.status === "active" && gameSlug ? (
        <Card>
          <CardContent>
            <div className="flex flex-col gap-3">
              <PlayButton
                gameSlug={gameSlug}
                locale={locale}
                strings={{
                  play: t("attackNow"),
                  starting: tg("starting"),
                  failed: tg("startFailed"),
                }}
              />
              <BossStrikeButton
                locale={locale}
                instanceId={state.instance.id}
                attemptId={latest?.id ?? null}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("topDamage")}</h2>
          {state.top.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {state.top.map((r) => (
                <li key={r.name} className="flex justify-between gap-2">
                  <span>{r.name}</span>
                  <span>{r.damage}</span>
                </li>
              ))}
            </ul>
          )}
          {state.mine ? (
            <div className="mt-2">
              <ProgressBar
                value={state.mine.damage}
                max={Math.max(state.instance.initialHp, 1)}
                label={t("myDamage", { damage: state.mine.damage })}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("feedTitle")}</h2>
          {state.feed.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {state.feed.map((f, i) => (
                <li key={`${f.createdAt}-${String(i)}`}>
                  {f.kind} · {f.createdAt}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {finished ? (
        <p className="text-sm text-ink-muted">
          {state.instance.status === "finalized" ? t("defeatedBody") : t("expiredBody")}
        </p>
      ) : null}
    </div>
  );
}
