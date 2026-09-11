import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { getSession } from "../../../../lib/server/auth";
import { userDbClient } from "../../../../lib/server/auth";
import { requireAdmin } from "../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../lib/server/staff-store";
import { ForbiddenBlock } from "../../../../components/forbidden-block";
import { CreateBatchForm, PatchToggle } from "../../../../components/admin-forms";

export default async function BatchesPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) return <ForbiddenBlock locale={locale} />;
  let batches: Array<{
    id: string;
    courseId: string;
    courseName: string;
    name: string;
    joinCode: string;
    isActive: boolean;
  }> = [];
  let courses: Array<{ id: string; title: string }> = [];
  try {
    const { orgIds } = await requireAdmin(client);
    const store = createSupabaseStaffStore(client);
    [batches, courses] = await Promise.all([
      store.listBatches(orgIds),
      store.listCourses(orgIds),
    ]);
  } catch {
    return <ForbiddenBlock locale={locale} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("batches")} />
      <Card>
        <CardContent>
          <CreateBatchForm locale={locale} courses={courses} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="tap-table">
              <thead>
                <tr>
                  <th scope="col">{t("batchNameLabel")}</th>
                  <th scope="col">{t("courseName")}</th>
                  <th scope="col">{t("joinCode")}</th>
                  <th scope="col">{t("colStatus")}</th>
                  <th scope="col">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <th scope="row">{b.name}</th>
                    <td>{b.courseName}</td>
                    <td>
                      <code>{b.joinCode}</code>
                    </td>
                    <td>{b.isActive ? t("statusActive") : t("statusInactive")}</td>
                    <td>
                      <PatchToggle
                        locale={locale}
                        url={`/api/admin/batches/${b.id}`}
                        body={{ isActive: !b.isActive }}
                        label={b.isActive ? t("deactivate") : t("activate")}
                        active={b.isActive}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
