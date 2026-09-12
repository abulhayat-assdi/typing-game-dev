import Link from "next/link";
import { Card, CardContent, EmptyState } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { clanPageContext } from "../../../../lib/server/clan-pages";
import { ClanBanner } from "../../../../components/clan-banner";
import { ClanMembersTable } from "../../../../components/clan-members-table";
import { ClanHelpBoard } from "../../../../components/clan-help-board";
import { ClanLockedPreviews } from "../../../../components/clan-locked-previews";
import { ClanMissionActions } from "../../../../components/clan-mission-actions";

/** Student clan dashboard: identity, rank, contributors, missions, help. */
export default async function ClanPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "clans");
  const { session, store } = await clanPageContext(locale);
  const clan = await store.getMyClan(session.userId);
  if (!clan) {
    return <EmptyState title={t("hubTitle")} description={t("emptySection")} />;
  }
  const [roster, missions, help, activity] = await Promise.all([
    store.getRoster(clan.id),
    store.getMissions(clan.id),
    store.getHelpRequests(clan.id),
    store.getActivity(clan.id),
  ]);
  const top = [...roster]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <ClanBanner locale={locale} clan={clan} />

      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">{t("sectionTop")}</h2>
            <Link
              href={`/${locale}/clan/members`}
              className="tap-btn tap-btn-secondary tap-btn-sm"
            >
              {t("viewMembers")}
            </Link>
          </div>
          <div className="mt-2">
            <ClanMembersTable locale={locale} rows={top} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">{t("sectionMissions")}</h2>
            <Link
              href={`/${locale}/clan/missions`}
              className="tap-btn tap-btn-secondary tap-btn-sm"
            >
              {t("viewMissions")}
            </Link>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {missions.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("emptySection")}</p>
            ) : null}
            {missions.slice(0, 3).map((m) => (
              <div key={m.id} className="flex flex-col gap-1 text-sm">
                <span className="font-bold">{m.title}</span>
                <ClanMissionActions
                  locale={locale}
                  missionId={m.id}
                  status={m.status}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">{t("sectionHelp")}</h2>
            <Link
              href={`/${locale}/clan/help`}
              className="tap-btn tap-btn-secondary tap-btn-sm"
            >
              {t("viewHelp")}
            </Link>
          </div>
          <div className="mt-2">
            <ClanHelpBoard locale={locale} requests={help.slice(0, 3)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionActivity")}</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {activity.slice(0, 10).map((a, i) => (
                <li key={`${a.createdAt}-${String(i)}`}>
                  {a.kind} · {a.createdAt}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ClanLockedPreviews locale={locale} />
    </div>
  );
}
