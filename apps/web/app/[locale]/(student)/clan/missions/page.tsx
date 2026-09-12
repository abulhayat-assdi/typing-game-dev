import { Card, CardContent, EmptyState, PageHeader, ProgressBar } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { clanPageContext } from "../../../../../lib/server/clan-pages";
import { ClanMissionActions } from "../../../../../components/clan-mission-actions";

/** Clan mission board: aggregate progress, start/sync actions. */
export default async function ClanMissionsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "clans");
  const { session, store } = await clanPageContext(locale);
  const clan = await store.getMyClan(session.userId);
  if (!clan) {
    return <EmptyState title={t("sectionMissions")} description={t("emptySection")} />;
  }
  const missions = await store.getMissions(clan.id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("sectionMissions")} description={clan.name} />
      {missions.length === 0 ? (
        <EmptyState title={t("sectionMissions")} description={t("emptySection")} />
      ) : (
        missions.map((m) => (
          <Card key={m.id}>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold">{m.title}</h2>
                <span className="tap-badge">{m.status}</span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                {m.objectives.map((o) => (
                  <ProgressBar
                    key={o.position}
                    value={o.current}
                    max={Math.max(o.target, 1)}
                    label={`${o.kind}: ${String(o.current)}/${String(o.target)}`}
                  />
                ))}
              </div>
              <div className="mt-2">
                <ClanMissionActions
                  locale={locale}
                  missionId={m.id}
                  status={m.status}
                />
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
