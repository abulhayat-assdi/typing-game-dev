import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { seasonPageContext } from "../../../../../lib/server/season-pages";

/** Season rewards view: tier ladder and final-note framing. */
export default async function SeasonRewardsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "seasons");
  const { session, store } = await seasonPageContext(locale);
  const seasons = await store.listSeasons();
  const active = seasons.find((s) => s.status === "active") ?? seasons[0] ?? null;
  if (!active) notFound();
  const detail = await store.getSeason(active.id, session.userId);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("sectionRewards")} description={detail.name} />
      <Card>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              {t("rewardFirst")} · {t("rewardSecond")} · {t("rewardThird")}
            </li>
            <li>{t("rewardParticipation")}</li>
          </ul>
          <p className="mt-2 text-sm text-ink-muted">
            {t("myTier", { tier: detail.myTier ?? "—" })} ·{" "}
            {t("myPoints", { points: detail.myPoints })}
          </p>
        </CardContent>
      </Card>
      {detail.status === "finalized" ? (
        <p className="text-sm text-ink-muted">{t("finalNote")}</p>
      ) : null}
    </div>
  );
}
