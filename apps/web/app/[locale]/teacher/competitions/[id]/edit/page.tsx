import { notFound } from "next/navigation";
import { PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../../lib/i18n";
import { userDbClient } from "../../../../../../lib/server/auth";
import { createSupabaseStaffStore } from "../../../../../../lib/server/staff-store";
import { createSupabaseStudentStore } from "../../../../../../lib/server/student-store";
import { getTeacherDashboard } from "../../../../../../lib/server/staff-data";
import { competitionPageContext } from "../../../../../../lib/server/competition-pages";
import { CompetitionForm } from "../../../../../../components/competition-form";

/** Teacher draft editing. Only drafts reach here; later states 404 the form. */
export default async function TeacherCompetitionEditPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "competitions");
  const { session, store } = await competitionPageContext(locale);
  const detail = await store.getCompetition(params.id, session.userId);
  if (!detail || detail.status !== "draft") notFound();

  const client = await userDbClient();
  if (!client) return <PageHeader title={t("editDraft")} />;
  const [dashboard, games] = await Promise.all([
    getTeacherDashboard(session.userId, createSupabaseStaffStore(client)),
    createSupabaseStudentStore(client).listGames(),
  ]);
  const xp =
    typeof detail.rewardPolicy.xp === "object" &&
    detail.rewardPolicy.xp !== null
      ? (detail.rewardPolicy.xp as Record<string, unknown>)
      : {};

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("editDraft")} description={detail.title} />
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
          id: detail.id,
          slug: detail.slug,
          title: detail.title,
          description: detail.description,
          gameSlugs: detail.gameSlugs,
          startsAt: detail.startsAt,
          endsAt: detail.endsAt,
          attemptLimit: detail.attemptLimit,
          attemptPolicy: detail.attemptPolicy,
          winnerXp: typeof xp["1"] === "number" ? xp["1"] : 0,
          participationXp:
            typeof xp.participation === "number" ? xp.participation : 0,
        }}
      />
    </div>
  );
}
