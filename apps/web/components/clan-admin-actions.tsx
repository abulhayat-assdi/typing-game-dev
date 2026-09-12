"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Admin clan controls: profile, status, roles, mission linking. */
export function ClanAdminActions({
  locale,
  clanId,
}: {
  locale: Locale;
  clanId: string;
}) {
  const t = getTranslator(locale, "clans");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [motto, setMotto] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("co_leader");
  const [missionId, setMissionId] = useState("");

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(false);
    try {
      const init: RequestInit =
        body === undefined
          ? { method }
          : {
              method,
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            };
      const res = await fetch(url, init);
      if (!res.ok) return false;
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    const ok = await call(`/api/admin/clans/${clanId}`, "PATCH", { motto });
    if (ok) setMotto("");
    else setError(true);
  }

  async function toggle(active: boolean): Promise<void> {
    const ok = await call(
      `/api/admin/clans/${clanId}/${active ? "activate" : "deactivate"}`,
      "POST",
    );
    if (!ok) setError(true);
  }

  async function assign(): Promise<void> {
    const ok = await call(`/api/admin/clans/${clanId}/roles`, "POST", {
      userId: userId.trim(),
      role,
    });
    if (ok) setUserId("");
    else setError(true);
  }

  async function link(): Promise<void> {
    const ok = await call(`/api/admin/clans/${clanId}/missions/link`, "POST", {
      missionId: missionId.trim(),
    });
    if (ok) setMissionId("");
    else setError(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("fieldMotto")}
          <input
            className="tap-input"
            value={motto}
            maxLength={120}
            onChange={(e) => {
              setMotto(e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void save();
          }}
        >
          {t("save")}
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void toggle(true);
          }}
        >
          {t("activate")}
        </button>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void toggle(false);
          }}
        >
          {t("deactivate")}
        </button>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("assignRole")}
          <input
            className="tap-input"
            value={userId}
            placeholder="user UUID"
            onChange={(e) => {
              setUserId(e.target.value);
            }}
          />
        </label>
        <select
          className="tap-input"
          value={role}
          aria-label={t("assignRole")}
          onChange={(e) => {
            setRole(e.target.value);
          }}
        >
          <option value="leader">leader</option>
          <option value="co_leader">co_leader</option>
          <option value="member">member</option>
        </select>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void assign();
          }}
        >
          {t("assignRole")}
        </button>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("linkMission")}
          <input
            className="tap-input"
            value={missionId}
            placeholder="mission UUID"
            onChange={(e) => {
              setMissionId(e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void link();
          }}
        >
          {t("linkMission")}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
