import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader, StatCard } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { getSession } from "../../../../../lib/server/auth";
import { userDbClient } from "../../../../../lib/server/auth";
import { createSupabaseStaffStore } from "../../../../../lib/server/staff-store";
import { ForbiddenError } from "../../../../../lib/server/staff-store";
import { getTeacherBatch } from "../../../../../lib/server/staff-data";
import { createSupabaseAdaptiveStore } from "../../../../../lib/server/adaptive-store";
import { AdaptiveBatchBoard } from "../../../../../components/adaptive-batch-board";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

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
  let adaptive: Record<string, unknown> = {};
  try {
    adaptive = await createSupabaseAdaptiveStore(client).batchSummary(
      params.batchId,
    );
  } catch {
    adaptive = {};
  }
  const attention = Array.isArray(adaptive.attention)
    ? adaptive.attention.filter(isRecord).map((a, i) => ({
        userId: typeof a.user_id === "string" ? a.user_id : `learner-${String(i)}`,
        accuracyDeclining: a.accuracy_declining === true,
        wpmDeclining: a.wpm_declining === true,
        criticalKeys:
          typeof a.critical_keys === "number" ? a.critical_keys : 0,
      }))
    : [];
  const averages = isRecord(adaptive.averages) ? adaptive.averages : null;
  const mechanics = Array.isArray(adaptive.weak_mechanics)
    ? adaptive.weak_mechanics
        .filter(isRecord)
        .map((m) => (typeof m.mechanic === "string" ? m.mechanic : ""))
        .filter((s) => s.length > 0)
    : [];

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

      <AdaptiveBatchBoard
        locale={locale}
        attention={attention}
        avgAccuracy={
          averages && typeof averages.accuracy === "number"
            ? averages.accuracy
            : null
        }
        avgWpm={
          averages && typeof averages.wpm === "number" ? averages.wpm : null
        }
        mechanics={mechanics}
      />
    </div>
  );
}
