import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { clanPageContext } from "../../../../../lib/server/clan-pages";
import { ClanHelpBoard } from "../../../../../components/clan-help-board";

/** Clan help board: request assistance, fund clanmates (bounded). */
export default async function ClanHelpPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "clans");
  const { session, store } = await clanPageContext(locale);
  const clan = await store.getMyClan(session.userId);
  if (!clan) {
    return <EmptyState title={t("sectionHelp")} description={t("emptySection")} />;
  }
  const help = await store.getHelpRequests(clan.id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("sectionHelp")} description={clan.name} />
      <ClanHelpBoard locale={locale} requests={help} />
    </div>
  );
}
