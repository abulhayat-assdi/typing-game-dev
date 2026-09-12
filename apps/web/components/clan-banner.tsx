import { Card, CardContent, PageHeader } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type { ClanProfile } from "../lib/server/clan-store";

type RoleKey = "roleLeader" | "roleCoLeader" | "roleMember";

function roleKey(role: string | null): RoleKey {
  if (role === "leader") return "roleLeader";
  if (role === "co_leader") return "roleCoLeader";
  return "roleMember";
}

/** Clan identity header: banner, name, motto, rank, XP, size. */
export function ClanBanner({
  locale,
  clan,
}: {
  locale: Locale;
  clan: ClanProfile;
}) {
  const t = getTranslator(locale, "clans");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={clan.name} description={clan.motto || clan.slug} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-sm text-ink-muted">{t("clanXp")}</p>
            <p className="text-xl font-bold">
              {t("clanXp", { points: clan.totalXp })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-ink-muted">{t("sectionMembers")}</p>
            <p className="text-xl font-bold">
              {t("memberCount", { count: clan.memberCount })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-ink-muted">{t("myRole")}</p>
            <p className="text-xl font-bold">{t(roleKey(clan.myRole))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-ink-muted">{t("colRank")}</p>
            <p className="text-xl font-bold">
              {clan.myRank === null ? "—" : t("myRank", { rank: clan.myRank })}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
