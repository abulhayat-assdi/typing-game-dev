import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { getSession } from "../../../../lib/server/auth";
import { userDbClient } from "../../../../lib/server/auth";
import { requireAdmin } from "../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../lib/server/staff-store";
import { ForbiddenBlock } from "../../../../components/forbidden-block";
import { AssignmentForm, DeleteButton } from "../../../../components/admin-forms";

export default async function TeachersPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) return <ForbiddenBlock locale={locale} />;
  let assignments: Array<{
    id: string;
    userId: string;
    courseId: string | null;
    batchId: string | null;
    batchName: string;
    courseName: string;
  }> = [];
  let courses: Array<{ id: string; title: string }> = [];
  let batches: Array<{ id: string; name: string }> = [];
  try {
    const { orgIds } = await requireAdmin(client);
    const store = createSupabaseStaffStore(client);
    [assignments, courses, batches] = await Promise.all([
      store.listAssignments(),
      store.listCourses(orgIds),
      store.listBatches(orgIds),
    ]);
  } catch {
    return <ForbiddenBlock locale={locale} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("teachers")} />
      <Card>
        <CardContent>
          <AssignmentForm
            locale={locale}
            courses={courses}
            batches={batches.map((b) => ({ id: b.id, name: b.name }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noResults")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tap-table">
                <thead>
                  <tr>
                    <th scope="col">{t("teachers")}</th>
                    <th scope="col">{t("courseName")}</th>
                    <th scope="col">{t("batchName")}</th>
                    <th scope="col">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <th scope="row" className="font-mono text-xs">
                        {a.userId.slice(0, 8)}…
                      </th>
                      <td>{a.courseName || "—"}</td>
                      <td>{a.batchName || "—"}</td>
                    <td>
                        <DeleteButton
                          locale={locale}
                          url={`/api/admin/assignments/${a.id}`}
                          label={t("removeAssignment")}
                        />
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
