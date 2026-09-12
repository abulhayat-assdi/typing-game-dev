"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Reliable boss configuration form (deliberately not visual). */
export function BossForm({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "bosses");
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [maxHp, setMaxHp] = useState(5000);
  const [phaseSpec, setPhaseSpec] = useState("Shell:5000-0:1");
  const [rewardXp, setRewardXp] = useState(60);
  const [rewardCoins, setRewardCoins] = useState(6);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setError(false);
    try {
      const phases = phaseSpec
        .split(";")
        .map((chunk) => chunk.trim())
        .filter((c) => c.length > 0)
        .map((chunk) => {
          const [pname, band, mult] = chunk.split(":");
          const [from, to] = (band ?? "").split("-").map(Number);
          return {
            name: (pname ?? "").trim(),
            hpFrom: from ?? 0,
            hpTo: to ?? -1,
            multiplier: Number(mult) || 1,
            rules: {},
            games: [],
          };
        });
      const res = await fetch("/api/admin/bosses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          description: "",
          lore: "",
          difficulty: "normal",
          maxHp,
          phases,
          rewardXp,
          rewardCoins,
        }),
      });
      if (!res.ok) throw new Error(`save failed: ${String(res.status)}`);
      const data = (await res.json()) as { id?: string };
      if (typeof data.id !== "string") throw new Error("bad response");
      router.push(`/${locale}/admin/bosses`);
      router.refresh();
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldSlug")}
        <input
          className="tap-input"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldName")}
        <input
          className="tap-input"
          value={name}
          maxLength={120}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldMaxHp")}
        <input
          className="tap-input"
          type="number"
          min={1}
          value={maxHp}
          onChange={(e) => {
            setMaxHp(Math.max(1, Number(e.target.value) || 1));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldPhases")}
        <input
          className="tap-input"
          value={phaseSpec}
          onChange={(e) => {
            setPhaseSpec(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldRewardXp")}
        <input
          className="tap-input"
          type="number"
          min={0}
          value={rewardXp}
          onChange={(e) => {
            setRewardXp(Math.max(0, Number(e.target.value) || 0));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldRewardCoins")}
        <input
          className="tap-input"
          type="number"
          min={0}
          value={rewardCoins}
          onChange={(e) => {
            setRewardCoins(Math.max(0, Number(e.target.value) || 0));
          }}
        />
      </label>
      <button
        type="button"
        className="tap-btn tap-btn-primary"
        disabled={saving || !slug.trim() || !name.trim()}
        onClick={() => {
          void save();
        }}
      >
        {t("saveDraft")}
      </button>
    </div>
  );
}
