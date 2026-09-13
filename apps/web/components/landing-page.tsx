import Link from "next/link";
import { Badge, Card, CardContent, SectionHeader, StatCard, WorldCard } from "@tap/ui";
import { GAMES, WORLDS } from "@tap/content";
import { getTranslator, type Locale } from "../lib/i18n";

const FEATURED_GAME_SLUGS = [
  "find-the-key",
  "home-row-harbor",
  "letter-rain",
  "word-builder",
  "word-sprint",
  "sentence-river",
  "speed-tunnel",
  "jungle-escape",
] as const;

const GAME_EMOJI: Record<string, string> = {
  "find-the-key": "🔑",
  "home-row-harbor": "⚓",
  "letter-rain": "🌧️",
  "word-builder": "🧱",
  "word-sprint": "🏃",
  "sentence-river": "🌊",
  "speed-tunnel": "🚀",
  "jungle-escape": "🌴",
};

const HOW_STEPS = [
  { title: "howStep1Title", desc: "howStep1Desc" },
  { title: "howStep2Title", desc: "howStep2Desc" },
  { title: "howStep3Title", desc: "howStep3Desc" },
  { title: "howStep4Title", desc: "howStep4Desc" },
] as const;

const SCHOOL_POINTS = [
  { title: "schoolsPoint1Title", desc: "schoolsPoint1Desc" },
  { title: "schoolsPoint2Title", desc: "schoolsPoint2Desc" },
  { title: "schoolsPoint3Title", desc: "schoolsPoint3Desc" },
] as const;

export function LandingPage({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "home");
  const gamesT = getTranslator(locale, "games");
  const clansT = getTranslator(locale, "clans");
  const warsT = getTranslator(locale, "wars");
  const tournamentsT = getTranslator(locale, "tournaments");
  const competitionsT = getTranslator(locale, "competitions");
  const missionsT = getTranslator(locale, "missions");
  const shopT = getTranslator(locale, "shop");
  const adaptiveT = getTranslator(locale, "adaptive");
  const leaderboardT = getTranslator(locale, "leaderboard");

  const featuredGames = FEATURED_GAME_SLUGS.map((slug) =>
    GAMES.find((g) => g.slug === slug),
  ).filter((g): g is NonNullable<typeof g> => Boolean(g));
  const moreGames = Math.max(GAMES.length - featuredGames.length, 0);

  const featuredWorlds = WORLDS.slice(0, 6);
  const moreWorlds = Math.max(WORLDS.length - featuredWorlds.length, 0);

  const features = [
    { icon: "⭐", title: t("featureXpTitle"), desc: t("featureXpDesc") },
    { icon: "🔥", title: t("featureStreakTitle"), desc: t("featureStreakDesc") },
    { icon: "📜", title: t("featureMissionsTitle"), desc: missionsT("hubSubtitle") },
    { icon: "🛡️", title: t("featureClanTitle"), desc: clansT("hubSubtitle") },
    { icon: "⚔️", title: t("featureWarsTitle"), desc: warsT("hubSubtitle") },
    { icon: "🏆", title: t("featureTournamentsTitle"), desc: tournamentsT("hubSubtitle") },
    { icon: "🥇", title: t("featureCompetitionsTitle"), desc: competitionsT("hubSubtitle") },
    { icon: "📈", title: t("featureLeaderboardTitle"), desc: leaderboardT("subtitle") },
    { icon: "🎯", title: t("featureAdaptiveTitle"), desc: adaptiveT("recommendedSubtitle") },
    { icon: "🛍️", title: t("featureShopTitle"), desc: shopT("marketSubtitle") },
  ];

  return (
    <div className="flex flex-col gap-16 pb-20 pt-8 md:gap-24">
      <section className="mx-auto w-full max-w-5xl px-4">
        <div className="flex flex-col items-center gap-6 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 px-6 py-14 text-center text-white shadow-lg md:px-16 md:py-20">
          <Badge tone="legendary">{t("heroEyebrow")}</Badge>
          <h1 className="max-w-2xl font-display text-3xl font-extrabold leading-tight md:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-xl text-base text-primary-50 md:text-lg">{t("subtitle")}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/${locale}/register`}
              className="tap-btn tap-btn-lg bg-white text-primary-700 hover:bg-primary-50"
            >
              {t("heroCtaPrimary")}
            </Link>
            <Link
              href={`/${locale}/login`}
              className="tap-btn tap-btn-lg border border-white/60 bg-transparent text-white hover:bg-white/10"
            >
              {t("heroCtaSecondary")}
            </Link>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 md:gap-4">
          <StatCard label={t("heroStatWorlds")} value={WORLDS.length} />
          <StatCard label={t("heroStatGames")} value={GAMES.length} />
          <StatCard label={t("heroStatTracks")} value={3} />
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4">
        <SectionHeader title={t("howTitle")} description={t("howSubtitle")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_STEPS.map((step, i) => (
            <Card key={step.title}>
              <CardContent className="flex flex-col gap-2">
                <span className="tap-badge tap-badge-primary w-fit">{i + 1}</span>
                <h3 className="font-display text-base font-bold text-ink">{t(step.title)}</h3>
                <p className="text-sm text-ink-muted">{t(step.desc)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4">
        <SectionHeader title={t("gamesTitle")} description={t("gamesSubtitle")} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {featuredGames.map((game) => (
            <Card key={game.id}>
              <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
                <span aria-hidden="true" className="text-3xl">
                  {GAME_EMOJI[game.slug] ?? "⌨️"}
                </span>
                <p className="text-sm font-semibold text-ink">{game.title[locale]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {moreGames > 0 ? (
          <p className="mt-4 text-center text-sm font-semibold text-primary-600">
            {t("gamesMoreLabel", { count: moreGames })}
          </p>
        ) : null}
      </section>

      <section className="mx-auto w-full max-w-5xl px-4">
        <SectionHeader title={t("worldsTitle")} description={t("worldsSubtitle")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredWorlds.map((world) => (
            <WorldCard
              key={world.slug}
              title={world.name[locale]}
              description={world.description[locale]}
              status={world.order === 1 ? "current" : "locked"}
              statusLabel={world.order === 1 ? gamesT("statusUnlocked") : gamesT("statusLocked")}
              art={
                <span className="text-4xl" aria-hidden="true">
                  🗺️
                </span>
              }
            />
          ))}
        </div>
        {moreWorlds > 0 ? (
          <p className="mt-4 text-center text-sm font-semibold text-primary-600">
            {t("worldsMoreLabel", { count: moreWorlds })}
          </p>
        ) : null}
      </section>

      <section className="mx-auto w-full max-w-5xl px-4">
        <SectionHeader title={t("featuresTitle")} description={t("featuresSubtitle")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardContent className="flex flex-col gap-2">
                <span aria-hidden="true" className="text-2xl">
                  {f.icon}
                </span>
                <h3 className="font-display text-base font-bold text-ink">{f.title}</h3>
                <p className="text-sm text-ink-muted">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4">
        <SectionHeader title={t("schoolsTitle")} description={t("schoolsSubtitle")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SCHOOL_POINTS.map((p) => (
            <Card key={p.title}>
              <CardContent className="flex flex-col gap-2">
                <h3 className="font-display text-base font-bold text-ink">{t(p.title)}</h3>
                <p className="text-sm text-ink-muted">{t(p.desc)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-raised px-6 py-12 text-center">
          <h2 className="font-display text-2xl font-bold text-ink">{t("finalCtaTitle")}</h2>
          <p className="max-w-md text-sm text-ink-muted">{t("finalCtaSubtitle")}</p>
          <Link href={`/${locale}/register`} className="tap-btn tap-btn-primary tap-btn-lg">
            {t("finalCtaButton")}
          </Link>
        </div>
      </section>
    </div>
  );
}
