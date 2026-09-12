import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";

/** Locked previews create anticipation without implementing gameplay. */
export function ClanLockedPreviews({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "clans");
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card>
        <CardContent>
          <h2 className="text-base font-bold">
            {t("bossPreview")} · {t("comingSoon")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t("bossPreviewBody")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="text-base font-bold">
            {t("warPreview")} · {t("comingSoon")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t("warPreviewBody")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
