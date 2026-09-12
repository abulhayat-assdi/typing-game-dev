"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

const CATEGORIES = [
  "DAILY",
  "WEEKLY",
  "EVENT",
  "GAME_COMPLETION",
  "ACCURACY_TARGET",
  "WPM_TARGET",
  "SCORE_TARGET",
  "WORD_COUNT",
  "CHARACTER_COUNT",
  "PERFECT_RUN",
  "WORLD_PROGRESS",
  "MULTI_GAME",
];

const KINDS = [
  "GAMES_COMPLETED",
  "ACCURACY_REACHED",
  "WPM_REACHED",
  "SCORE_REACHED",
  "CHARS_TYPED",
  "WORDS_TYPED",
  "PERFECT_RUN",
  "DISTINCT_GAMES",
  "PERSONAL_BEST",
  "WORLD_GAMES",
];

/** Reliable configuration form for missions (deliberately not visual). */
export function MissionForm({
  locale,
  missionId,
}: {
  locale: Locale;
  missionId?: string;
}) {
  const t = getTranslator(locale, "missions");
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("DAILY");
  const [kind, setKind] = useState("GAMES_COMPLETED");
  const [count, setCount] = useState(2);
  const [threshold, setThreshold] = useState(90);
  const [rewardXp, setRewardXp] = useState(20);
  const [rewardCoins, setRewardCoins] = useState(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const needsThreshold =
    kind === "ACCURACY_REACHED" ||
    kind === "WPM_REACHED" ||
    kind === "SCORE_REACHED";

  async function save(): Promise<void> {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(
        missionId ? `/api/admin/missions/${missionId}` : "/api/admin/missions",
        {
          method: missionId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            missionId
              ? { title: title.trim(), rewardXp, rewardCoins }
              : {
                  slug: slug.trim().toLowerCase(),
                  title: title.trim(),
                  description: description.trim(),
                  category,
                  difficulty: "beginner",
                  skillBand: "",
                  objectives: [
                    {
                      kind,
                      target: needsThreshold ? { threshold } : { count },
                    },
                  ],
                  gameSlugs: [],
                  worldIds: [],
                  rewardXp,
                  rewardCoins,
                  startsAt: "",
                  endsAt: "",
                },
          ),
        },
      );
      if (!res.ok) throw new Error(`save failed: ${String(res.status)}`);
      const data = (await res.json()) as { id?: string };
      router.push(`/${locale}/admin/missions/${data.id ?? missionId ?? ""}`);
      router.refresh();
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  const valid =
    title.trim().length > 0 && (missionId ? true : slug.trim().length > 0);

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
      {!missionId ? (
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
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldTitle")}
        <input
          className="tap-input"
          value={title}
          maxLength={160}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </label>
      {!missionId ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldDescription")}
            <textarea
              className="tap-input"
              value={description}
              rows={2}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldCategory")}
            <select
              className="tap-input"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldObjectiveKind")}
            <select
              className="tap-input"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
              }}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          {needsThreshold ? (
            <label className="flex flex-col gap-1 text-sm">
              {t("fieldThreshold")}
              <input
                className="tap-input"
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => {
                  setThreshold(Math.max(1, Number(e.target.value) || 1));
                }}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              {t("fieldTargetCount")}
              <input
                className="tap-input"
                type="number"
                min={1}
                value={count}
                onChange={(e) => {
                  setCount(Math.max(1, Number(e.target.value) || 1));
                }}
              />
            </label>
          )}
        </>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldWinnerXp")}
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
        disabled={saving || !valid}
        onClick={() => {
          void save();
        }}
      >
        {t("saveDraft")}
      </button>
    </div>
  );
}
