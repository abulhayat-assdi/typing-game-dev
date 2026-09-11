import Link from "next/link";
import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { competitionPageContext } from "../../../../lib/server/competition-pages";
import { statusSection } from "../../../../lib/competitions";
import { CompetitionCard } from "../../../../components/competition-card";

/** Admin competitions: organization-wide oversight (RLS-scoped). */
export default async function AdminCompetitionsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "competitions");
  const { session, store } = await competitionPageContext(locale);
  const all = await store.listCompetitions(session.userId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("manageTitle")} />
      <div>
        <Link
          className="tap-btn tap-btn-primary"
          href={`/${locale}/admin/competitions/new`}
        >
          {t("createTitle")}
        </Link>
      </div>
      {all.length === 0 ? (
        <EmptyState title={t("manageTitle")} description={t("noCompetitions")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {all.map((c) => (
            <CompetitionCard
              key={c.id}
              locale={locale}
              competition={c}
              section={statusSection(c.status)}
              href={`/${locale}/admin/competitions/${c.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
