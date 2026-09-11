import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader, StatCard } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { getSession } from "../../../../../lib/server/auth";
import { userDbClient } from "../../../../../lib/server/auth";
import { createSupabaseStaffStore } from "../../../../../lib/server/staff-store";
import { ForbiddenError } from "../../../../../lib/server/staff-store";
import { createSupabaseStudentStore } from "../../../../../lib/server/student-store";
import { getTeacherStudent } from "../../../../../lib/server/staff-data";

export default async function TeacherStudentPage({
  params,
}: {
  params: { locale: string; userId: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) notFound();
  let data;
  try {
    data = await getTeacherStudent(
      session.userId,
      params.userId,
      createSupabaseStaffStore(client),
      createSupabaseStudentStore(client),
    );
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.detail.fullName}
        description={data.detail.email}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("level")} value={data.detail.level} />
        <StatCard label={t("xp")} value={data.detail.xpTotal} />
        <StatCard
          label={t("averageWpm")}
          value={Math.round(data.aggregates.avgWpm)}
        />
        <StatCard
          label={t("averageAccuracy")}
          value={`${String(Math.round(data.aggregates.avgAccuracy))}%`}
        />
      </div>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("records")}</h2>
          {data.records.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noResults")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {data.records.slice(0, 12).map((r) => (
                <li key={`${r.gameSlug}-${r.metric}`} className="flex justify-between gap-3">
                  <span>
                    {r.gameSlug} · {r.metric}
                  </span>
                  <span className="font-semibold">{Math.round(r.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
