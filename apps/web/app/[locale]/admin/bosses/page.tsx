import Link from "next/link";
import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { bossPageContext } from "../../../../lib/server/boss-pages";

/** Admin boss definitions (drafts included via RLS admin policy). */
export default async function AdminBossesPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "bosses");
  const { store } = await bossPageContext(locale);
  const bosses = await store.listBosses();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("manageTitle")} />
      {bosses.length === 0 ? (
        <EmptyState title={t("manageTitle")} description={t("noBosses")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {bosses.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link href={`/${locale}/admin/bosses/${b.id}`}>
                {b.name} ({b.slug})
              </Link>
              <span className="tap-badge">
                {b.difficulty} · {b.maxHp} HP · {b.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
