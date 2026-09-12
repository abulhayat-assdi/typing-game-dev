"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Admin tournament creation form (configuration, not a visual editor). */
export function TournamentForm({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "tournaments");
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [participantType, setParticipantType] = useState("student");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          description: "",
          theme: theme.trim(),
          format: "single_elimination",
          participantType,
          startAt: startAt ? new Date(startAt).toISOString() : null,
          endAt: endAt ? new Date(endAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(`save failed: ${String(res.status)}`);
      router.push(`/${locale}/admin/tournaments`);
      router.refresh();
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  const valid =
    /^[a-z0-9-]{1,80}$/.test(slug.trim()) &&
    name.trim().length > 0 &&
    name.trim().length <= 160 &&
    (participantType === "student" || participantType === "clan");

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
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldTheme")}
        <input
          className="tap-input"
          value={theme}
          onChange={(e) => {
            setTheme(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldParticipantType")}
        <select
          className="tap-input"
          value={participantType}
          onChange={(e) => {
            setParticipantType(e.target.value);
          }}
        >
          <option value="student">{t("typeStudent")}</option>
          <option value="clan">{t("typeClan")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldStart")}
        <input
          className="tap-input"
          type="datetime-local"
          value={startAt}
          onChange={(e) => {
            setStartAt(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldEnd")}
        <input
          className="tap-input"
          type="datetime-local"
          value={endAt}
          onChange={(e) => {
            setEndAt(e.target.value);
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
        {t("createTitle")}
      </button>
    </div>
  );
}
