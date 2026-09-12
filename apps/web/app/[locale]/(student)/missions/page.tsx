import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { missionPageContext } from "../../../../lib/server/mission-pages";
import { StudentMissionCard } from "../../../../components/mission-card";

/** Student quest hub: today's quests, weekly challenge, special quests. */
export default async function MissionsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "missions");
  const { session, store } = await missionPageContext(locale);
  const all = await store.getToday(session.userId);
  const daily = all.filter((m) => m.period === "daily");
  const weekly = all.filter((m) => m.period === "weekly");
  const event = all.filter((m) => m.period === "event");

  const sections = [
    { key: "daily", title: t("sectionDaily"), items: daily },
    { key: "weekly", title: t("sectionWeekly"), items: weekly },
    { key: "event", title: t("sectionEvent"), items: event },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("hubTitle")} description={t("hubSubtitle")} />
      {all.length === 0 ? (
        <EmptyState title={t("hubTitle")} description={t("emptySection")} />
      ) : null}
      {sections.map((s) => (
        <section key={s.key} aria-label={s.title}>
          <h2 className="mb-2 text-base font-bold">{s.title}</h2>
          {s.items.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {s.items.map((m) => (
                <StudentMissionCard
                  key={m.instanceId}
                  locale={locale}
                  mission={m}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
