import { PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { getSession, userDbClient } from "../../../../../lib/server/auth";
import { createSupabaseStaffStore } from "../../../../../lib/server/staff-store";
import { createSupabaseStudentStore } from "../../../../../lib/server/student-store";
import { getTeacherDashboard } from "../../../../../lib/server/staff-data";
import { CompetitionForm } from "../../../../../components/competition-form";

/** Teacher competition creation (assigned batches + game catalog). */
export default async function TeacherCompetitionNewPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "competitions");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) return <PageHeader title={t("createTitle")} />;
  const staffStore = createSupabaseStaffStore(client);
  const studentStore = createSupabaseStudentStore(client);
  const [dashboard, games] = await Promise.all([
    getTeacherDashboard(session.userId, staffStore),
    studentStore.listGames(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} />
      <CompetitionForm
        locale={locale}
        games={games.map((g) => ({
          slug: g.slug,
          title: g.slug,
        }))}
        batches={dashboard.batches.map((b) => ({
          id: b.batchId,
          name: b.batchName,
        }))}
        initial={{
          slug: "",
          title: "",
          description: "",
          gameSlugs: [],
          startsAt: "",
          endsAt: "",
          attemptLimit: 3,
          attemptPolicy: "BEST_SCORE",
          winnerXp: 100,
          participationXp: 10,
        }}
      />
    </div>
  );
}
