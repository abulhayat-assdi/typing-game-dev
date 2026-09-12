import Link from "next/link";
import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { clanPageContext } from "../../../../lib/server/clan-pages";

/** Teacher clans: assigned batches' clans (RLS-scoped, read-only). */
export default async function TeacherClanPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "clans");
  const { store } = await clanPageContext(locale);
  const clans = await store.listClans();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("hubTitle")} />
      {clans.length === 0 ? (
        <EmptyState title={t("hubTitle")} description={t("emptySection")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {clans.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link href={`/${locale}/teacher/clan/${c.id}`}>{c.name}</Link>
              <span className="tap-badge">
                {t("memberCount", { count: c.memberCount })} ·{" "}
                {t("clanXp", { points: c.totalXp })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
