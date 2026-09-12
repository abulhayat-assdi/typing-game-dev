import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { clanPageContext } from "../../../../../lib/server/clan-pages";
import { warPageContext } from "../../../../../lib/server/war-pages";
import { bossPageContext } from "../../../../../lib/server/boss-pages";
import { ClanBanner } from "../../../../../components/clan-banner";
import { ClanMembersTable } from "../../../../../components/clan-members-table";

/** Teacher clan view: members, contribution, mission progress. */
export default async function TeacherClanDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "clans");
  const { store } = await clanPageContext(locale);
  const clan = await store.getClan(params.id);
  if (!clan) notFound();
  const { store: warStore } = await warPageContext(locale);
  const wars = (await warStore.listWars()).filter(
    (w) => w.challengerClanId === clan.id || w.defenderClanId === clan.id,
  );
  const { store: bossStore } = await bossPageContext(locale);
  const battles = (await bossStore.listMyInstances()).filter(
    (i) => i.clanId === clan.id,
  );
  const [roster, missions, activity] = await Promise.all([
    store.getRoster(clan.id),
    store.getMissions(clan.id),
    store.getActivity(clan.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ClanBanner locale={locale} clan={clan} />
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
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">Wars</h2>
          {wars.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {wars.map((w) => (
                <li key={w.id} className="flex justify-between gap-2">
                  <Link href={`/${locale}/clan/wars/${w.id}`}>
                    {w.challengerName} vs {w.defenderName}
                  </Link>
                  <span className="tap-badge">{w.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">Boss battles</h2>
          {battles.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {battles.map((b) => (
                <li key={b.id} className="flex justify-between gap-2">
                  <Link href={`/${locale}/clan/bosses/${b.id}`}>
                    {b.bossName} ({b.currentHp}/{String(b.initialHp)} HP)
                  </Link>
                  <span className="tap-badge">{b.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
