"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Reliable season configuration form (deliberately not visual). */
export function SeasonForm({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "seasons");
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/seasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          description: "",
          theme: theme.trim(),
          startAt: startAt ? new Date(startAt).toISOString() : "",
          endAt: endAt ? new Date(endAt).toISOString() : "",
        }),
      });
      if (!res.ok) throw new Error(`save failed: ${String(res.status)}`);
      router.push(`/${locale}/admin/seasons`);
      router.refresh();
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  const valid =
    slug.trim().length > 0 &&
    name.trim().length > 0 &&
    startAt.length > 0 &&
    endAt.length > 0 &&
    Date.parse(endAt) > Date.parse(startAt);

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
          maxLength={160}
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
      <p className="text-sm text-ink-muted">{t("serverTimeNote")}</p>
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
