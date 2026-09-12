import Link from "next/link";
import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { missionPageContext } from "../../../../lib/server/mission-pages";

/** Admin mission list (drafts included via RLS admin policy). */
export default async function AdminMissionsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "missions");
  const { store } = await missionPageContext(locale);
  const missions = await store.listMissions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("manageTitle")} />
      <div>
        <Link
          className="tap-btn tap-btn-primary"
          href={`/${locale}/admin/missions/new`}
        >
          {t("createTitle")}
        </Link>
      </div>
      {missions.length === 0 ? (
        <EmptyState title={t("manageTitle")} description={t("noMissions")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {missions.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link href={`/${locale}/admin/missions/${m.id}`}>
                {m.title} ({m.slug})
              </Link>
              <span className="tap-badge">
                {m.category} · {m.status} · v{String(m.version)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
