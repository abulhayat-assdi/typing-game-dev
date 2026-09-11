import { PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { userDbClient } from "../../../../../lib/server/auth";
import { requireAdmin } from "../../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../../lib/server/staff-store";
import { createSupabaseStudentStore } from "../../../../../lib/server/student-store";
import { competitionPageContext } from "../../../../../lib/server/competition-pages";
import { CompetitionForm } from "../../../../../components/competition-form";

/** Admin competition creation across scoped batches. */
export default async function AdminCompetitionNewPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "competitions");
  await competitionPageContext(locale);
  const client = await userDbClient();
  if (!client) return <PageHeader title={t("createTitle")} />;
  const { orgIds } = await requireAdmin(client);
  const [batches, games] = await Promise.all([
    createSupabaseStaffStore(client).listBatches(orgIds),
    createSupabaseStudentStore(client).listGames(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} />
      <CompetitionForm        locale={locale}
        games={games.map((g) => ({
          slug: g.slug,
          title: g.slug,
        }))}
        batches={batches.map((b) => ({ id: b.id, name: b.name }))}
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
