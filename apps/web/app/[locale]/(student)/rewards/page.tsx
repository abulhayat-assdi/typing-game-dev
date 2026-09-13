import { Card, CardContent, EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { rewardedPageContext } from "../../../../lib/server/rewarded-pages";
import { RewardOptIn } from "../../../../components/reward-opt-in";

/** Optional rewards: catalog offers, each honestly labeled. */
export default async function RewardsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "rewards");
  const { store } = await rewardedPageContext(locale);
  const [rewards, policy, sessions] = await Promise.all([
    store.rewardCatalog().catch(() => []),
    store.policy().catch(() => null),
    store.mySessions().catch(() => []),
  ]);
  const active = rewards.filter((r) => r.enabled);
  const provider = policy?.provider ?? "mock";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("rewardsTitle")}
        description={t("rewardsSubtitle")}
      />
      {active.length === 0 ? (
        <EmptyState
          title={t("rewardsTitle")}
          description={t("noOpportunities")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((r) => (
            <Card key={r.slug}>
              <CardContent>
                <RewardOptIn
                  locale={locale}
                  rewardSlug={r.slug}
                  rewardLabel={`${r.ref} ×${String(r.amount)}`}
                  placement="rewards_page"
                  provider={provider}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {sessions.length > 0 ? (
        <Card>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm text-ink-muted">
              {sessions.slice(0, 5).map((s) => (
                <li key={s.id}>
                  {s.rewardSlug} · {s.status}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
