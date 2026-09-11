import { notFound } from "next/navigation";
import { GAMES } from "@tap/content";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import type { Vars } from "../../../../../lib/i18n";
import { studentContext } from "../../../../../lib/server/student-pages";
import { createSupabaseAttemptStore } from "../../../../../lib/server/attempt-store";
import { userDbClient } from "../../../../../lib/server/auth";
import { PlayExperience } from "../../../../../components/play-experience";
import { ResultScreen, type ResultStrings } from "../../../../../components/result-screen";

/**
 * Play route (M6). Server loads the attempt (ownership enforced), then either
 * replays a terminal result from stored state or mounts the live shell.
 */
export default async function PlayPage({
  params,
}: {
  params: { locale: string; attemptId: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const play = getTranslator(locale, "play");
  const result = getTranslator(locale, "result");
  const { session } = await studentContext(locale);
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  const store = createSupabaseAttemptStore(client);

  const attempt = await store.getAttempt(params.attemptId);
  if (!attempt || attempt.userId !== session.userId) notFound();
  const def = GAMES.find((g) => g.slug === attempt.gameSlug);
  if (!def) notFound();

  const gameTitle = locale === "bn" && def.title.bn ? def.title.bn : def.title.en;
  const links = {
    gameHref: `/${locale}/games/${def.slug}`,
    mapHref: `/${locale}/map`,
    dashboardHref: `/${locale}/dashboard`,
  };

  if (attempt.status === "validated") {
    const stored = await store.getResult(attempt.id);
    if (stored) {
      return (
        <ResultScreen
          result={{
            score: stored.score,
            accuracy: stored.accuracy,
            effectiveWpm: stored.effectiveWpm,
            progression: null,
          }}
          snap={null}
          isPB={false}
          strings={resultStrings(result)}
          gameHref={links.gameHref}
          mapHref={links.mapHref}
          dashboardHref={links.dashboardHref}
        />
      );
    }
  }

  if (attempt.status !== "started" && attempt.status !== "in_progress") {
    notFound();
  }

  return (
    <PlayExperience
      attemptId={attempt.id}
      gameSlug={def.slug}
      gameTitle={gameTitle}
      expectedText={attempt.expectedText}
      timingKind={def.timingRules.kind}
      timingLimit={def.timingRules.limitSeconds ?? null}
      strings={{
        play: {
          tapToFocus: play("tapToFocus"),
          timeLeft: play("timeLeft"),
          wpm: play("wpm"),
          accuracy: play("accuracy"),
          combo: play("combo"),
          progress: play("progress"),
          pause: play("pause"),
          resume: play("resume"),
          restart: play("restart"),
          quit: play("quit"),
          submitting: play("submitting"),
          expired: play("expired"),
          failedToSubmit: play("failedToSubmit"),
          focusLost: play("focusLost"),
          screenReaderProgress: play("screenReaderProgress"),
        },
        result: resultStrings(result),
      }}
      gameHref={links.gameHref}
      mapHref={links.mapHref}
      dashboardHref={links.dashboardHref}
    />
  );
}

function resultStrings(t: (key: keyof ResultStrings, vars?: Vars) => string) {
  return {
    title: t("title"),
    subtitle: t("subtitle"),
    wpm: t("wpm"),
    accuracy: t("accuracy"),
    score: t("score"),
    duration: t("duration"),
    errors: t("errors"),
    corrected: t("corrected"),
    personalBest: t("personalBest"),
    xpEarned: t("xpEarned"),
    coinsEarned: t("coinsEarned"),
    levelUp: t("levelUp"),
    badgeEarned: t("badgeEarned"),
    streakKept: t("streakKept"),
    unlocked: t("unlocked"),
    playAgain: t("playAgain"),
    backToMap: t("backToMap"),
    continueAdventure: t("continueAdventure"),
    rejectedTitle: t("rejectedTitle"),
    rejectedDescription: t("rejectedDescription"),
    expiredTitle: t("expiredTitle"),
    expiredDescription: t("expiredDescription"),
  };
}
