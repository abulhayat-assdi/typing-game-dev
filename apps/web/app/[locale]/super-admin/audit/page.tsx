import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { getSession } from "../../../../lib/server/auth";
import { userDbClient } from "../../../../lib/server/auth";
import { requireSuperAdmin } from "../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../lib/server/staff-store";
import { getAdminOverview } from "../../../../lib/server/staff-data";
import { ForbiddenBlock } from "../../../../components/forbidden-block";

export default async function SuperAuditPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) return <ForbiddenBlock locale={locale} />;
  let rows: Array<{
    id: number;
    actor: string | null;
    action: string;
    entity: string;
    entityId: string;
    createdAt: string;
  }> = [];
  try {
    await requireSuperAdmin(client);
    const overview = await getAdminOverview(null, createSupabaseStaffStore(client));
    rows = overview.recentAudit;
  } catch {
    return <ForbiddenBlock locale={locale} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("auditLog")} />
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noResults")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tap-table">
                <thead>
                  <tr>
                    <th scope="col">{t("time")}</th>
                    <th scope="col">{t("actor")}</th>
                    <th scope="col">{t("action")}</th>
                    <th scope="col">{t("entity")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td>{a.createdAt.slice(0, 16).replace("T", " ")}</td>
                      <td className="font-mono text-xs">
                        {a.actor ? `${a.actor.slice(0, 8)}…` : "—"}
                      </td>
                      <td>{a.action}</td>
                      <td>
                        {a.entity} · {a.entityId.slice(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
