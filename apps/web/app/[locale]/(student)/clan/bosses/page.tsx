import Link from "next/link";
import { Card, CardContent, EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { bossPageContext } from "../../../../../lib/server/boss-pages";

/** Student boss lobby: definitions plus my clan's battles. */
export default async function BossLobbyPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "bosses");
  const { store } = await bossPageContext(locale);
  const [bosses, instances] = await Promise.all([
    store.listBosses(),
    store.listMyInstances(),
  ]);
  const active = instances.filter((i) => i.status === "active");
  const upcoming = instances.filter(
    (i) => i.status === "scheduled" || i.status === "processing",
  );
  const done = instances.filter(
    (i) =>
      i.status === "finalized" ||
      i.status === "defeated" ||
      i.status === "expired",
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("hubTitle")} description={t("hubSubtitle")} />
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionActive")}</h2>
          {active.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {active.map((i) => (
                <li key={i.id} className="text-sm">
                  <Link href={`/${locale}/clan/bosses/${i.id}`}>
                    {i.bossName} — {i.currentHp}/{String(i.initialHp)} HP
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionUpcoming")}</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((i) => (
                <li key={i.id} className="text-sm">
                  <Link href={`/${locale}/clan/bosses/${i.id}`}>
                    {i.bossName} · {i.status}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionCompleted")}</h2>
          {done.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {done.map((i) => (
                <li key={i.id} className="text-sm">
                  <Link href={`/${locale}/clan/bosses/${i.id}`}>
                    {i.bossName} · {i.status}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {bosses.length === 0 ? (
        <EmptyState title={t("hubTitle")} description={t("emptySection")} />
      ) : null}
    </div>
  );
}
