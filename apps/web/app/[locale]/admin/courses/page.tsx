import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { getSession } from "../../../../lib/server/auth";
import { userDbClient } from "../../../../lib/server/auth";
import { requireAdmin } from "../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../lib/server/staff-store";
import { ForbiddenBlock } from "../../../../components/forbidden-block";
import { CreateCourseForm, PatchToggle } from "../../../../components/admin-forms";

export default async function CoursesPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) return <ForbiddenBlock locale={locale} />;
  let courses: Array<{
    id: string;
    organizationId: string;
    title: string;
    slug: string;
    isActive: boolean;
  }> = [];
  let orgId = "";
  try {
    const { orgIds } = await requireAdmin(client);
    const store = createSupabaseStaffStore(client);
    courses = await store.listCourses(orgIds);
    orgId = orgIds?.[0] ?? "";
    if (!orgId) {
      const orgs = await store.listOrgs();
      orgId = orgs[0]?.id ?? "";
    }
  } catch {
    return <ForbiddenBlock locale={locale} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("courses")} />
      <Card>
        <CardContent>
          <CreateCourseForm locale={locale} orgId={orgId} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="tap-table">
              <thead>
                <tr>
                  <th scope="col">{t("courseTitle")}</th>
                  <th scope="col">{t("courseSlug")}</th>
                  <th scope="col">{t("colStatus")}</th>
                  <th scope="col">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{c.title}</th>
                    <td>{c.slug}</td>
                    <td>{c.isActive ? t("statusActive") : t("statusInactive")}</td>
                    <td>
                      <PatchToggle
                        locale={locale}
                        url={`/api/admin/courses/${c.id}`}
                        body={{ isActive: !c.isActive }}
                        label={c.isActive ? t("deactivate") : t("activate")}
                        active={c.isActive}
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
