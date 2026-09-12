import Link from "next/link";
import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { seasonPageContext } from "../../../../lib/server/season-pages";

/** Admin season list (drafts included via RLS admin policy). */
export default async function AdminSeasonsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "seasons");
  const { store } = await seasonPageContext(locale);
  const seasons = await store.listSeasons();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("manageTitle")} />
      <div>
        <Link
          className="tap-btn tap-btn-primary"
          href={`/${locale}/admin/seasons/new`}
        >
          {t("createTitle")}
        </Link>
      </div>
      {seasons.length === 0 ? (
        <EmptyState title={t("manageTitle")} description={t("noSeasons")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {seasons.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link href={`/${locale}/admin/seasons/${s.id}`}>
                {s.name} ({s.slug})
              </Link>
              <span className="tap-badge">{s.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
