import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader, StatCard } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { getSession } from "../../../../../lib/server/auth";
import { userDbClient } from "../../../../../lib/server/auth";
import { createSupabaseStaffStore } from "../../../../../lib/server/staff-store";
import { ForbiddenError } from "../../../../../lib/server/staff-store";
import { getTeacherBatch } from "../../../../../lib/server/staff-data";

export default async function TeacherBatchPage({
  params,
}: {
  params: { locale: string; batchId: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) notFound();
  let data;
  try {
    data = await getTeacherBatch(
      session.userId,
      params.batchId,
      createSupabaseStaffStore(client),
    );
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${data.info.name} (${data.info.joinCode})`}
        description={data.info.courseName}
      />
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">
            {t("members")} ({data.members.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="tap-table">
              <thead>
                <tr>
                  <th scope="col">{t("colRoll")}</th>
                  <th scope="col">{t("colName")}</th>
                  <th scope="col">{t("level")}</th>
                  <th scope="col">{t("xp")}</th>
                  <th scope="col">{t("streak")}</th>
                  <th scope="col">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.memberId}>
                    <td>{m.rollNumber}</td>
                    <th scope="row">{m.fullName}</th>
                    <td>{m.level}</td>
                    <td>{m.xpTotal}</td>
                    <td>{m.streak}</td>
                    <td>
                      <Link
                        href={`/${locale}/teacher/students/${m.userId}`}
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label={t("recentActivity")} value={data.recent.length} />
      </div>
    </div>
  );
}
