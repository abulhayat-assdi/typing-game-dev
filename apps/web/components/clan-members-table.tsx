import { getTranslator, type Locale } from "../lib/i18n";
import type { ClanRosterRow } from "../lib/server/clan-store";

type RoleKey = "roleLeader" | "roleCoLeader" | "roleMember";

function roleKey(role: string): RoleKey {
  if (role === "leader") return "roleLeader";
  if (role === "co_leader") return "roleCoLeader";
  return "roleMember";
}

/** Privacy-safe member table: no emails, no auth data, no moderation. */
export function ClanMembersTable({
  locale,
  rows,
}: {
  locale: Locale;
  rows: ClanRosterRow[];
}) {
  const t = getTranslator(locale, "clans");
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">{t("emptySection")}</p>;
  }
  const ranked = [...rows].sort(
    (a, b) => b.contribution - a.contribution,
  );
  return (
    <div className="overflow-x-auto">
      <table className="tap-table">
        <thead>
          <tr>
            <th scope="col">{t("colRank")}</th>
            <th scope="col">{t("colMember")}</th>
            <th scope="col">{t("colRoll")}</th>
            <th scope="col">{t("colLevel")}</th>
            <th scope="col">{t("colXp")}</th>
            <th scope="col">{t("colWpm")}</th>
            <th scope="col">{t("colAccuracy")}</th>
            <th scope="col">{t("colStreak")}</th>
            <th scope="col">{t("colBadges")}</th>
            <th scope="col">{t("colContribution")}</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.userId} className={r.isMe ? "tap-row-mine" : undefined}>
              <td>{i + 1}</td>
              <td>
                {r.displayName} · {t(roleKey(r.role))}
              </td>
              <td>{r.rollNumber || "—"}</td>
              <td>{r.level}</td>
              <td>{r.xpTotal}</td>
              <td>{r.bestWpm === null ? "—" : r.bestWpm}</td>
              <td>{r.bestAccuracy === null ? "—" : `${String(r.bestAccuracy)}%`}</td>
              <td>{r.streakCurrent}</td>
              <td>{r.badgeCount}</td>
              <td>{r.contribution}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
