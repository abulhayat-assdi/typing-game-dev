import Link from "next/link";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { getSession } from "../../../../lib/server/auth";
import { userDbClient } from "../../../../lib/server/auth";
import { requireAdmin } from "../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../lib/server/staff-store";
import { ForbiddenBlock } from "../../../../components/forbidden-block";

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { q?: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) return <ForbiddenBlock locale={locale} />;
  let students: Array<{
    userId: string;
    fullName: string;
    email: string;
    rollNumber: string;
    batchName: string;
    status: string;
  }> = [];
  try {
    await requireAdmin(client);
    students = await createSupabaseStaffStore(client).searchUsers(
      searchParams.q ?? "",
      50,
    );
  } catch {
    return <ForbiddenBlock locale={locale} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("students")} />
      <Card>
        <CardContent>
          <form method="get" className="mb-3 flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={searchParams.q ?? ""}
              placeholder={t("searchPlaceholder")}
              aria-label={t("search")}
              className="tap-input-wrap tap-input"
            />
            <button type="submit" className="tap-btn tap-btn-primary tap-btn-md">
              {t("search")}
            </button>
          </form>
          {students.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noResults")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tap-table">
                <thead>
                  <tr>
                    <th scope="col">{t("colName")}</th>
                    <th scope="col">{t("colRoll")}</th>
                    <th scope="col">{t("colBatch")}</th>
                    <th scope="col">{t("colStatus")}</th>
                    <th scope="col">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={`${s.userId}-${s.rollNumber}`}>
                      <th scope="row">
                        {s.fullName}
                        <span className="block text-xs font-normal text-ink-faint">
                          {s.email}
                        </span>
                      </th>
                      <td>{s.rollNumber}</td>
                      <td>{s.batchName}</td>
                      <td>{s.status}</td>
                      <td>
                        <Link
                          href={`/${locale}/admin/students/${s.userId}`}
                          className="tap-link-btn"
                        >
                          {t("viewStudent")}
                        </Link>
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
