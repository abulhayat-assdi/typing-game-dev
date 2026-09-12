import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";

export interface BatchAttentionEntry {
  userId: string;
  accuracyDeclining: boolean;
  wpmDeclining: boolean;
  criticalKeys: number;
}

/** Teacher batch board: attention flags + aggregates (no key detail). */
export function AdaptiveBatchBoard({
  locale,
  attention,
  avgAccuracy,
  avgWpm,
  mechanics,
}: {
  locale: Locale;
  attention: BatchAttentionEntry[];
  avgAccuracy: number | null;
  avgWpm: number | null;
  mechanics: string[];
}) {
  const t = getTranslator(locale, "adaptive");
  return (
    <Card>
      <CardContent>
        <h2 className="mb-2 text-base font-bold">{t("attentionTitle")}</h2>
        {attention.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("noAttention")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {attention.map((a) => (
              <li key={a.userId}>
                {a.userId}
                {a.accuracyDeclining ? " · accuracy" : ""}
                {a.wpmDeclining ? " · speed" : ""}
                {a.criticalKeys > 0
                  ? ` · ${String(a.criticalKeys)} keys`
                  : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-ink-muted">
          {t("batchAverages")}:{" "}
          {avgAccuracy === null ? "—" : `${String(Math.round(avgAccuracy * 10) / 10)}%`}
          {" · "}
          {avgWpm === null ? "—" : String(Math.round(avgWpm * 10) / 10)}
        </p>
        {mechanics.length > 0 ? (
          <p className="mt-1 text-sm text-ink-muted">
            {t("weakMechanics")}: {mechanics.join(", ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
