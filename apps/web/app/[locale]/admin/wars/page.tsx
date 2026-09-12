import Link from "next/link";
import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { warPageContext } from "../../../../lib/server/war-pages";

/** Admin war list (RLS-scoped to managed organizations). */
export default async function AdminWarsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "wars");
  const { store } = await warPageContext(locale);
  const wars = await store.listWars();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("manageTitle")} />
      {wars.length === 0 ? (
        <EmptyState title={t("manageTitle")} description={t("noWars")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {wars.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link href={`/${locale}/admin/wars/${w.id}`}>
                {w.challengerName} vs {w.defenderName}
              </Link>
              <span className="tap-badge">{w.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
