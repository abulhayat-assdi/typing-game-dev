import { notFound } from "next/navigation";
import { Card, CardContent } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { clanPageContext } from "../../../../../lib/server/clan-pages";
import { ClanBanner } from "../../../../../components/clan-banner";
import { ClanMembersTable } from "../../../../../components/clan-members-table";
import { ClanAdminActions } from "../../../../../components/clan-admin-actions";

/** Admin clan management: profile, status, roles, mission linking. */
export default async function AdminClanManagePage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "clans");
  const { store } = await clanPageContext(locale);
  const clan = await store.getClan(params.id);
  if (!clan) notFound();
  const [roster, missions] = await Promise.all([
    store.getRoster(clan.id),
    store.getMissions(clan.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ClanBanner locale={locale} clan={clan} />
      <Card>
        <CardContent>
          <ClanAdminActions locale={locale} clanId={clan.id} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionMembers")}</h2>
          <ClanMembersTable locale={locale} rows={roster} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionMissions")}</h2>
          {missions.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {missions.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>{m.title}</span>
                  <span className="tap-badge">{m.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}