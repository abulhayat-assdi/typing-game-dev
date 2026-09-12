import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { warPageContext } from "../../../../../lib/server/war-pages";
import { WarBoard } from "../../../../../components/war-board";
import { WarActions } from "../../../../../components/war-actions";

/** Admin war oversight: board, participants, cancel/finalize/advance. */
export default async function AdminWarDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "wars");
  const { store } = await warPageContext(locale);
  const war = await store.getWar(params.id);
  if (!war) notFound();
  const board = await store.getBoard(war.id);

  const actions: ("cancel" | "advance" | "sync" | "finalize")[] = [];
  if (war.status !== "finalized") actions.push("sync");
  if (
    war.status === "accepted" ||
    war.status === "preparation" ||
    war.status === "live"
  ) {
    actions.push("advance");
  }
  if (war.status === "processing") actions.push("finalize");
  if (
    war.status !== "finalized" &&
    war.status !== "processing" &&
    war.status !== "live"
  ) {
    actions.push("cancel");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("versus", {
          a: war.challengerName || "—",
          b: war.defenderName || "—",
        })}
        description={war.status}
      />
      {actions.length > 0 ? (
        <Card>
          <CardContent>
            <WarActions locale={locale} warId={war.id} actions={actions} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent>
          <WarBoard locale={locale} rows={board} />
        </CardContent>
      </Card>
    </div>
  );
}
