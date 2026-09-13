import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { rewardedPageContext } from "../../../../lib/server/rewarded-pages";
import { RewardAdminControls } from "../../../../components/reward-admin-controls";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Admin rewarded-ads console: policy, definitions, funnel. */
export default async function AdminRewardsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "rewards");
  const { store } = await rewardedPageContext(locale);
  const policy = await store.policy().catch(() => null);
  const funnel: Record<string, unknown> = await store
    .funnel()
    .catch(() => ({}));
  const rewards = await store.rewardCatalog().catch(() => []);
  const events = isRecord(funnel.events)
    ? Object.entries(funnel.events)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("manageTitle")} />
      <Card>
        <CardContent>
          <RewardAdminControls
            locale={locale}
            policy={{
              enabled: policy?.enabled ?? false,
              provider: policy?.provider ?? "mock",
              dailyLimit: policy?.dailyLimit ?? 5,
              cooldownMinutes: policy?.cooldownMinutes ?? 60,
              maxRewardsPerDay: policy?.maxRewardsPerDay ?? 5,
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("funnelTitle")}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {events.length === 0 ? (
                <li className="text-ink-muted">—</li>
              ) : (
                events.map(([k, v]) => (
                  <li key={k}>
                    {k}: {typeof v === "number" ? v : "—"}
                  </li>
                ))
              )}
            </ul>
          <p className="mt-2 text-xs text-ink-muted">
            {rewards.map((r) => `${r.slug}:${r.enabled ? "on" : "off"}`).join(" · ")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
