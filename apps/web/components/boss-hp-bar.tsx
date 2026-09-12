import { ProgressBar } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";

/**
 * Boss HP bar with phase marker. Motion-safe pulse on low HP only
 * (disabled under prefers-reduced-motion); never blocks interaction.
 */
export function BossHpBar({
  locale,
  currentHp,
  maxHp,
  phaseName,
}: {
  locale: Locale;
  currentHp: number;
  maxHp: number;
  phaseName: string;
}) {
  const t = getTranslator(locale, "bosses");
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const low = pct <= 25 && pct > 0;
  return (
    <div className="flex flex-col gap-1" role="group" aria-label={phaseName}>
      <p className="text-sm font-bold">
        {t("bossHp", { current: currentHp, max: maxHp })} · {phaseName}
      </p>
      <div className={low ? "motion-safe:animate-pulse" : undefined}>
        <ProgressBar value={currentHp} max={Math.max(maxHp, 1)} label={phaseName} />
      </div>
    </div>
  );
}
