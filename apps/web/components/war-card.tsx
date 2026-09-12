import Link from "next/link";
import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type { WarSummary } from "../lib/server/war-store";

type StatusKey =
  | "statusDraft"
  | "statusChallengeSent"
  | "statusPendingResponse"
  | "statusAccepted"
  | "statusDeclined"
  | "statusPreparation"
  | "statusLive"
  | "statusProcessing"
  | "statusFinalized"
  | "statusCancelled"
  | "statusExpired";

function statusKey(status: string): StatusKey {
  switch (status) {
    case "draft":
      return "statusDraft";
    case "challenge_sent":
      return "statusChallengeSent";
    case "pending_response":
      return "statusPendingResponse";
    case "accepted":
      return "statusAccepted";
    case "declined":
      return "statusDeclined";
    case "preparation":
      return "statusPreparation";
    case "live":
      return "statusLive";
    case "processing":
      return "statusProcessing";
    case "finalized":
      return "statusFinalized";
    case "cancelled":
      return "statusCancelled";
    default:
      return "statusExpired";
  }
}

/** War card with YOUR CLAN vs OPPONENT visual priority. */
export function WarCard({
  locale,
  war,
  href,
}: {
  locale: Locale;
  war: WarSummary;
  href: string;
}) {
  const t = getTranslator(locale, "wars");
  const mineFirst = war.myClanId === war.challengerClanId;
  const mine = mineFirst ? war.challengerName : war.defenderName;
  const theirs = mineFirst ? war.defenderName : war.challengerName;
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold">
            <Link href={href}>
              {t("versus", { a: mine || "—", b: theirs || "—" })}
            </Link>
          </h3>
          <span className="tap-badge">{t(statusKey(war.status))}</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {t("versus", { a: war.challengerName || "—", b: war.defenderName || "—" })}
        </p>
      </CardContent>
    </Card>
  );
}
