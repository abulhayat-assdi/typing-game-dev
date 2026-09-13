"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Admin policy controls: flags, provider, limits, recovery. */
export function RewardAdminControls({
  locale,
  policy,
}: {
  locale: Locale;
  policy: {
    enabled: boolean;
    provider: string;
    dailyLimit: number;
    cooldownMinutes: number;
    maxRewardsPerDay: number;
  };
}) {
  const t = getTranslator(locale, "rewards");
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy.enabled);
  const [provider, setProvider] = useState(policy.provider);
  const [dailyLimit, setDailyLimit] = useState(String(policy.dailyLimit));
  const [cooldown, setCooldown] = useState(String(policy.cooldownMinutes));
  const [maxRewards, setMaxRewards] = useState(String(policy.maxRewardsPerDay));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/rewards/ads/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          provider,
          daily_limit: Number.parseInt(dailyLimit, 10),
          cooldown_minutes: Number.parseInt(cooldown, 10),
          max_rewards_per_day: Number.parseInt(maxRewards, 10),
        }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
          }}
        />
        {t("enableLabel")}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("providerLabel")}
        <select
          className="tap-input"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
          }}
        >
          <option value="mock">{t("mockOnly")}</option>
          <option value="google_offerwall">google_offerwall</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        daily_limit
        <input
          className="tap-input"
          inputMode="numeric"
          value={dailyLimit}
          onChange={(e) => {
            setDailyLimit(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        cooldown_minutes
        <input
          className="tap-input"
          inputMode="numeric"
          value={cooldown}
          onChange={(e) => {
            setCooldown(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        max_rewards_per_day
        <input
          className="tap-input"
          inputMode="numeric"
          value={maxRewards}
          onChange={(e) => {
            setMaxRewards(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="tap-btn tap-btn-primary tap-btn-sm"
        disabled={busy}
        onClick={() => {
          void save();
        }}
      >
        {t("savePolicy")}
      </button>
    </div>
  );
}
