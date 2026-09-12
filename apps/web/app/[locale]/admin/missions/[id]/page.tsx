import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { missionPageContext } from "../../../../../lib/server/mission-pages";
import { MissionForm } from "../../../../../components/mission-form";
import { MissionAdminActions } from "../../../../../components/mission-admin-actions";
import { userDbClient } from "../../../../../lib/server/auth";
import { isRecord } from "../../../../../lib/server/mission-store";

/** Admin mission management: draft edits, activation, objectives. */
export default async function AdminMissionManagePage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "missions");
  const { store } = await missionPageContext(locale);
  const missions = await store.listMissions();
  const row = missions.find((m) => m.id === params.id);
  if (!row) notFound();

  const client = await userDbClient();
  let objectives: { position: number; kind: string; target: string }[] = [];
  if (client) {
    const res = await client
      .from("mission_objectives")
      .select("position, kind, target")
      .eq("mission_id", params.id)
      .order("position");
    if (!res.error && Array.isArray(res.data)) {
      const rows: unknown[] = res.data;
      objectives = rows
        .filter(isRecord)
        .map((o) => ({
          position: typeof o.position === "number" ? o.position : 0,
          kind: typeof o.kind === "string" ? o.kind : "",
          target: JSON.stringify(o.target ?? {}),
        }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={row.title} description={`${row.slug} · v${String(row.version)}`} />
      <Card>
        <CardContent>
          <MissionAdminActions
            locale={locale}
            missionId={row.id}
            status={row.status}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("detailsObjectives")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {objectives.map((o) => (
              <li key={o.position}>
                {String(o.position)}. {o.kind} — {o.target}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {row.status === "draft" ? (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-base font-bold">{t("editDraft")}</h2>
            <MissionForm locale={locale} missionId={row.id} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
