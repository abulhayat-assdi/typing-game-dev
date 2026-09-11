import Link from "next/link";
import { Alert, Card, CardContent, EmptyState, PageHeader } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import {
  formatDateTime,
  statusKey,
} from "../lib/competitions";
import type {
  CompetitionDetail,
  LeaderboardRow,
} from "../lib/server/competition-store";
import { CompetitionActions } from "./competition-actions";
import { CompetitionBoard } from "./competition-board";
import { CompetitionCountdown } from "./competition-countdown";
import { PlayButton } from "./play-button";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="font-bold">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Student competition details: rules, registration state, live entry,
 * server-derived board, immutable final results. All values server-side.
 */
export function CompetitionDetails({
  locale,
  detail,
  board,
  serverNowIso,
  gameSlug,
}: {
  locale: Locale;
  detail: CompetitionDetail;
  board: LeaderboardRow[];
  serverNowIso: string;
  gameSlug: string | null;
}) {
  const t = getTranslator(locale, "competitions");
  const tg = getTranslator(locale, "games");
  const registered = detail.myEntry !== null;
  const mine = board.find((r) => r.isMe) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.title}
        description={`${detail.type} · ${t(statusKey(detail.status))}`}
      />

      <Card>
        <CardContent>
          <dl className="flex flex-col gap-1">
            <DetailRow label={t("detailsSchedule")} value={`${formatDateTime(detail.startsAt, locale)} → ${formatDateTime(detail.endsAt, locale)}`} />
            <DetailRow label={t("fieldGame")} value={detail.gameSlugs.join(", ") || "—"} />
            <DetailRow label={t("detailsScoring")} value={detail.attemptPolicy} />
            <DetailRow
              label={t("detailsAttempts")}
              value={t("cardAttempts", { count: detail.attemptLimit })}
            />
          </dl>
          {detail.status === "registration_open" ||
          detail.status === "scheduled" ? (
            <div className="mt-2">
              <CompetitionCountdown
                serverNowIso={serverNowIso}
                targetIso={detail.startsAt}
                label={t("countdownStarts", { time: "" }).replace(/:\s*$/, "")}
              />
            </div>
          ) : null}
          {detail.status === "live" ? (
            <div className="mt-2">
              <CompetitionCountdown
                serverNowIso={serverNowIso}
                targetIso={detail.endsAt}
                label={t("countdownEnds", { time: "" }).replace(/:\s*$/, "")}
              />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-ink-muted">{t("serverTimeNote")}</p>
        </CardContent>
      </Card>

      {detail.status === "registration_open" ? (
        <Card>
          <CardContent>
            {registered ? (
              <p className="text-sm">{t("alreadyRegistered")}</p>
            ) : (
              <CompetitionActions
                locale={locale}
                competitionId={detail.id}
                actions={["register"]}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {detail.status === "live" && registered && gameSlug ? (
        <Card>
          <CardContent>
            <div className="flex flex-col gap-3">
              <PlayButton
                gameSlug={gameSlug}
                locale={locale}
                strings={{
                  play: t("enterNow"),
                  starting: tg("starting"),
                  failed: tg("startFailed"),
                }}
              />
              <CompetitionActions
                locale={locale}
                competitionId={detail.id}
                actions={["attachLatest"]}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {detail.status === "live" && !registered ? (
        <Alert tone="warning" title={t("hubTitle")}>
          {t("registrationClosed")}
        </Alert>
      ) : null}

      {mine ? (
        <Card>
          <CardContent>
            <p className="text-sm font-bold">
              {t("yourRank", { rank: mine.rank })} ·{" "}
              {t("resultScore", { score: mine.score })}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("viewBoard")}</h2>
          <CompetitionBoard locale={locale} rows={board} />
        </CardContent>
      </Card>

      {detail.status === "finalized" ? (
        <p className="text-sm text-ink-muted">{t("finalizedNote")}</p>
      ) : null}
    </div>
  );
}

/** Staff management view: draft editing entry, lifecycle actions, board. */
export function CompetitionManage({
  locale,
  detail,
  board,
  baseHref,
}: {
  locale: Locale;
  detail: CompetitionDetail;
  board: LeaderboardRow[];
  baseHref: string;
}) {
  const t = getTranslator(locale, "competitions");
  const actions: ("publish" | "open" | "close" | "finalize")[] = [];
  if (detail.status === "draft") actions.push("publish");
  if (detail.status === "scheduled") actions.push("open");
  if (detail.status === "registration_open") actions.push("close");
  if (detail.status === "processing") actions.push("finalize");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.title}
        description={`${detail.type} · ${t(statusKey(detail.status))}`}
      />
      {actions.length > 0 ? (
        <Card>
          <CardContent>
            <CompetitionActions
              locale={locale}
              competitionId={detail.id}
              actions={actions}
            />
          </CardContent>
        </Card>
      ) : null}
      {detail.status === "draft" ? (
        <Card>
          <CardContent>
            <Link
              className="tap-btn tap-btn-secondary"
              href={`${baseHref}/${detail.id}/edit`}
            >
              {t("editDraft")}
            </Link>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("viewBoard")}</h2>
          <CompetitionBoard locale={locale} rows={board} />
        </CardContent>
      </Card>
      {board.length === 0 ? (
        <EmptyState title={t("viewBoard")} description={t("emptySection")} />
      ) : null}
    </div>
  );
}
