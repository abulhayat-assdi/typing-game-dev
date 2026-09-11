"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";

async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; body: unknown }> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    ...init,
  });
  let body: unknown = null;
  try {
    body = (await res.json()) as unknown;
  } catch {
    body = null;
  }
  return { ok: res.ok, body };
}

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function run(fn: () => Promise<{ ok: boolean }>, failed: string): Promise<void> {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fn();
      if (!r.ok) setError(failed);
      else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError(failed);
    }
    setBusy(false);
  }
  return { busy, error, saved, run, clear: () => { setError(null); } };
}

function StatusLine({ error, saved, locale }: { error: string | null; saved: boolean; locale: Locale }) {
  const t = getTranslator(locale, "staff");
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (saved) return <Alert tone="success">{t("saved")}</Alert>;
  return null;
}

export function CreateCourseForm({
  locale,
  orgId,
}: {
  locale: Locale;
  orgId: string;
}) {
  const t = getTranslator(locale, "staff");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const s = useSubmit();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void s.run(
          async () =>
            api("/api/admin/courses", {
              method: "POST",
              body: JSON.stringify({ organizationId: orgId, title, slug }),
            }),
          t("failed"),
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          className="tap-input-wrap tap-input"
          aria-label={t("courseTitle")}
          placeholder={t("courseTitle")}
          value={title}
          onChange={(e) => { setTitle(e.target.value); }}
          required
        />
        <input
          className="tap-input-wrap tap-input"
          aria-label={t("courseSlug")}
          placeholder={t("courseSlug")}
          value={slug}
          onChange={(e) => { setSlug(e.target.value); }}
          required
        />
        <button type="submit" className="tap-btn tap-btn-primary tap-btn-md" disabled={s.busy}>
          {t("newCourse")}
        </button>
      </div>
      <StatusLine error={s.error} saved={s.saved} locale={locale} />
    </form>
  );
}

export function ToggleButton({
  locale,
  label,
  active,
  onToggle,
}: {
  locale: Locale;
  label: string;
  active: boolean;
  onToggle: () => Promise<{ ok: boolean }>;
}) {
  const t = getTranslator(locale, "staff");
  const s = useSubmit();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="tap-btn tap-btn-secondary tap-btn-sm"
        disabled={s.busy}
        onClick={() => void s.run(onToggle, t("failed"))}
      >
        {label}: {active ? t("enabled").toLowerCase() : t("disabled").toLowerCase()}
      </button>
      {s.error ? <span className="text-xs text-red-600">{s.error}</span> : null}
    </span>
  );
}

export function CreateBatchForm({
  locale,
  courses,
}: {
  locale: Locale;
  courses: Array<{ id: string; title: string }>;
}) {
  const t = getTranslator(locale, "staff");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const s = useSubmit();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void s.run(
          async () =>
            api("/api/admin/batches", {
              method: "POST",
              body: JSON.stringify({ courseId, name, joinCode: joinCode || undefined }),
            }),
          t("failed"),
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <select
          aria-label={t("courseName")}
          className="tap-input-wrap tap-input"
          value={courseId}
          onChange={(e) => { setCourseId(e.target.value); }}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <input
          className="tap-input-wrap tap-input"
          aria-label={t("batchNameLabel")}
          placeholder={t("batchNameLabel")}
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          required
        />
        <input
          className="tap-input-wrap tap-input"
          aria-label={t("joinCode")}
          placeholder={`${t("joinCode")} (${t("soon")})`}
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value); }}
        />
        <button type="submit" className="tap-btn tap-btn-primary tap-btn-md" disabled={s.busy}>
          {t("newBatch")}
        </button>
      </div>
      <StatusLine error={s.error} saved={s.saved} locale={locale} />
    </form>
  );
}

export function MembershipEditor({
  locale,
  userId,
  rollNumber,
  isActive,
  batches,
  currentBatchId,
}: {
  locale: Locale;
  userId: string;
  rollNumber: string;
  isActive: boolean;
  batches: Array<{ id: string; name: string }>;
  currentBatchId: string;
}) {
  const t = getTranslator(locale, "staff");
  const [roll, setRoll] = useState(rollNumber);
  const [batchId, setBatchId] = useState(currentBatchId);
  const [active, setActive] = useState(isActive);
  const s = useSubmit();
  async function patch(op: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(op),
    });
    return res.ok;
  }
  async function save(): Promise<{ ok: boolean }> {
    if (roll !== rollNumber) {
      if (!(await patch({ op: "roll", rollNumber: roll }))) return { ok: false };
    }
    if (batchId !== currentBatchId) {
      if (!(await patch({ op: "move", batchId }))) return { ok: false };
    }
    if (active !== isActive) {
      if (!(await patch({ op: "active", isActive: active }))) return { ok: false };
    }
    return { ok: true };
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          className="tap-input-wrap tap-input"
          aria-label={t("newRoll")}
          value={roll}
          onChange={(e) => { setRoll(e.target.value); }}
        />
        <select
          aria-label={t("moveStudent")}
          className="tap-input-wrap tap-input"
          value={batchId}
          onChange={(e) => { setBatchId(e.target.value); }}
        >
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => { setActive(e.target.checked); }}
          />
          {active ? t("statusActive") : t("statusInactive")}
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-primary tap-btn-md"
          disabled={s.busy}
          onClick={() => void s.run(save, t("failed"))}
        >
          {t("save")}
        </button>
      </div>
      <StatusLine error={s.error} saved={s.saved} locale={locale} />
    </div>
  );
}

export function AccountStatusSelect({
  locale,
  userId,
  status,
}: {
  locale: Locale;
  userId: string;
  status: string;
}) {
  const t = getTranslator(locale, "staff");
  const [value, setValue] = useState(status);
  const s = useSubmit();
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={t("colStatus")}
        className="tap-input-wrap tap-input"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          void s.run(
            async () =>
              api(`/api/admin/users/${encodeURIComponent(userId)}`, {
                method: "PATCH",
                body: JSON.stringify({ op: "status", status: next }),
              }),
            t("failed"),
          );
        }}
      >
        {["active", "inactive", "suspended"].map((v) => (
          <option key={v} value={v}>
            {v === "active" ? t("statusActive") : v === "inactive" ? t("statusInactive") : t("statusSuspended")}
          </option>
        ))}
      </select>
      {s.error ? <span className="text-xs text-red-600">{s.error}</span> : null}
    </span>
  );
}

export function AssignmentForm({
  locale,
  courses,
  batches,
}: {
  locale: Locale;
  courses: Array<{ id: string; title: string }>;
  batches: Array<{ id: string; name: string }>;
}) {
  const t = getTranslator(locale, "staff");
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState("");
  const s = useSubmit();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const isCourse = target.startsWith("course:");
        void s.run(
          async () =>
            api("/api/admin/assignments", {
              method: "POST",
              body: JSON.stringify({
                email,
                ...(isCourse
                  ? { courseId: target.slice("course:".length) }
                  : { batchId: target.slice("batch:".length) }),
              }),
            }),
          t("failed"),
        );
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          className="tap-input-wrap tap-input"
          aria-label={t("teacherEmail")}
          placeholder={t("teacherEmail")}
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
          required
        />
        <select
          aria-label={t("assignTeacher")}
          className="tap-input-wrap tap-input"
          value={target}
          onChange={(e) => { setTarget(e.target.value); }}
          required
        >
          <option value="">{t("assignTeacher")}</option>
          {courses.map((c) => (
            <option key={c.id} value={`course:${c.id}`}>
              {t("courseName")}: {c.title}
            </option>
          ))}
          {batches.map((b) => (
            <option key={b.id} value={`batch:${b.id}`}>
              {t("batchName")}: {b.name}
            </option>
          ))}
        </select>
        <button type="submit" className="tap-btn tap-btn-primary tap-btn-md" disabled={s.busy}>
          {t("assignTeacher")}
        </button>
      </div>
      <StatusLine error={s.error} saved={s.saved} locale={locale} />
    </form>
  );
}

/** Generic PATCH toggle (serializable props only — server pages stay clean). */
export function PatchToggle({
  locale,
  url,
  body,
  label,
  active,
}: {
  locale: Locale;
  url: string;
  body: Record<string, unknown>;
  label: string;
  active: boolean;
}) {
  return (
    <ToggleButton
      locale={locale}
      label={label}
      active={active}
      onToggle={async () => {
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        return { ok: res.ok };
      }}
    />
  );
}

/** Serializable DELETE button (URL only — safe to render from server pages). */
export function DeleteButton({
  locale,
  url,
  label,
}: {
  locale: Locale;
  url: string;
  label: string;
}) {
  return (
    <RemoveButton
      locale={locale}
      label={label}
      onRemove={async () => {
        const res = await fetch(url, {
          method: "DELETE",
          credentials: "same-origin",
        });
        return { ok: res.ok };
      }}
    />
  );
}

export function RemoveButton({
  locale,
  label,
  onRemove,
}: {
  locale: Locale;
  label: string;
  onRemove: () => Promise<{ ok: boolean }>;
}) {
  const t = getTranslator(locale, "staff");
  const s = useSubmit();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="tap-btn tap-btn-secondary tap-btn-sm"
        disabled={s.busy}
        onClick={() => void s.run(onRemove, t("failed"))}
      >
        {label}
      </button>
      {s.error ? <span className="text-xs text-red-600">{s.error}</span> : null}
    </span>
  );
}

/** Feature-flag toggle for the super-admin console (super-only route). */
export function FlagToggle({
  locale,
  flagKey,
  enabled,
  description,
}: {
  locale: Locale;
  flagKey: string;
  enabled: boolean;
  description: string;
}) {
  const t = getTranslator(locale, "staff");
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div>
        <p className="font-mono text-sm font-bold">{flagKey}</p>
        <p className="text-xs text-ink-muted">{description}</p>
      </div>
      <PatchToggle
        locale={locale}
        url={`/api/admin/flags/${encodeURIComponent(flagKey)}`}
        body={{ enabled: !enabled }}
        label={enabled ? t("enabled") : t("disabled")}
        active={enabled}
      />
    </div>
  );
}
