"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

const STEPS = [
  "stepBasic",
  "stepEligibility",
  "stepGame",
  "stepSchedule",
  "stepAttempts",
  "stepScoring",
  "stepRewards",
  "stepReview",
] as const;

export interface CompetitionFormInitial {
  id?: string;
  slug: string;
  title: string;
  description: string;
  gameSlugs: string[];
  startsAt: string;
  endsAt: string;
  attemptLimit: number;
  attemptPolicy: string;
  winnerXp: number;
  participationXp: number;
}

function toLocalInputValue(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = String(d.getFullYear());
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** Multi-step draft form. Creates (POST) or edits (PATCH) via the API. */
export function CompetitionForm({
  locale,
  initial,
  games,
  batches,
}: {
  locale: Locale;
  initial: CompetitionFormInitial;
  games: { slug: string; title: string }[];
  batches: { id: string; name: string }[];
}) {
  const t = getTranslator(locale, "competitions");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState(initial.slug);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [gameSlugs, setGameSlugs] = useState<string[]>(initial.gameSlugs);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(toLocalInputValue(initial.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(initial.endsAt));
  const [attemptLimit, setAttemptLimit] = useState(initial.attemptLimit);
  const [attemptPolicy, setAttemptPolicy] = useState(initial.attemptPolicy);
  const [winnerXp, setWinnerXp] = useState(initial.winnerXp);
  const [participationXp, setParticipationXp] = useState(
    initial.participationXp,
  );

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  async function save(publish: boolean): Promise<void> {
    setSaving(true);
    setError(null);
    const body = {
      slug: slug.trim().toLowerCase(),
      title: title.trim(),
      description: description.trim(),
      type: "SCORE_ATTACK",
      visibility: "batch",
      batchIds,
      courseIds: [],
      skillBands: [],
      gameSlugs,
      scoring: { metric: "score" },
      attemptPolicy,
      attemptLimit,
      rewardPolicy: {
        xp: { "1": winnerXp, participation: participationXp },
        coins: {},
      },
      startsAt: startsAt ? new Date(startsAt).toISOString() : "",
      endsAt: endsAt ? new Date(endsAt).toISOString() : "",
      registrationStartsAt: null,
      registrationEndsAt: null,
    };
    try {
      const url = initial.id ? `/api/competitions/${initial.id}` : "/api/competitions";
      const res = await fetch(url, {
        method: initial.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(t("actionFailed"));
        return;
      }
      const data = (await res.json()) as { id?: string };
      const id = initial.id ?? data.id;
      if (publish && id) {
        const pub = await fetch(`/api/competitions/${id}/publish`, {
          method: "POST",
        });
        if (!pub.ok) {
          setError(t("actionFailed"));
          return;
        }
      }
      router.push(`/${locale}/teacher/competitions/${id ?? ""}`);
      router.refresh();
    } catch {
      setError(t("actionFailed"));
    } finally {
      setSaving(false);
    }
  }

  const validBasic = slug.trim().length > 0 && title.trim().length > 0;
  const validGame = gameSlugs.length > 0;
  const validSchedule =
    startsAt.length > 0 &&
    endsAt.length > 0 &&
    Date.parse(endsAt) > Date.parse(startsAt);
  const current = STEPS[step] ?? "stepBasic";
  const canNext =
    (current === "stepBasic" && validBasic) ||
    (current === "stepGame" && validGame) ||
    (current === "stepSchedule" && validSchedule) ||
    !["stepBasic", "stepGame", "stepSchedule"].includes(current);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-2" aria-label="steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={
              i === step ? "tap-badge" : "tap-badge tap-badge-muted"
            }
          >
            {String(i + 1)}. {t(s)}
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {STEPS[step] === "stepBasic" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldTitle")}
            <input
              className="tap-input"
              value={title}
              onChange={(e) => { setTitle(e.target.value) } }
              maxLength={160}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldSlug")}
            <input
              className="tap-input"
              value={slug}
              onChange={(e) => { setSlug(e.target.value) } }
              placeholder="spring-sprint"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldDescription")}
            <textarea
              className="tap-input"
              value={description}
              onChange={(e) => { setDescription(e.target.value) } }
              rows={3}
            />
          </label>
        </div>
      ) : null}

      {STEPS[step] === "stepEligibility" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold">{t("stepEligibility")}</legend>
          {batches.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptySection")}</p>
          ) : null}
          {batches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={batchIds.includes(b.id)}
                onChange={() => { setBatchIds(toggle(batchIds, b.id)) } }
              />
              {b.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      {STEPS[step] === "stepGame" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold">{t("fieldGame")}</legend>
          {games.map((g) => (
            <label key={g.slug} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={gameSlugs.includes(g.slug)}
                onChange={() => { setGameSlugs(toggle(gameSlugs, g.slug)) } }
              />
              {g.title} ({g.slug})
            </label>
          ))}
        </fieldset>
      ) : null}

      {STEPS[step] === "stepSchedule" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldStart")}
            <input
              className="tap-input"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => { setStartsAt(e.target.value) } }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldEnd")}
            <input
              className="tap-input"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => { setEndsAt(e.target.value) } }
            />
          </label>
          <p className="text-sm text-ink-muted">{t("serverTimeNote")}</p>
        </div>
      ) : null}

      {STEPS[step] === "stepAttempts" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldAttemptLimit")}
            <input
              className="tap-input"
              type="number"
              min={1}
              value={attemptLimit}
              onChange={(e) => {
                setAttemptLimit(Math.max(1, Number(e.target.value) || 1));
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldAttemptPolicy")}
            <select
              className="tap-input"
              value={attemptPolicy}
              onChange={(e) => { setAttemptPolicy(e.target.value) } }
            >
              {[
                "BEST_SCORE",
                "BEST_ACCURACY",
                "BEST_WPM",
                "LATEST_VALID",
                "AVERAGE_TOP_3",
              ].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {STEPS[step] === "stepScoring" ? (
        <p className="text-sm text-ink-muted">{t("detailsScoring")}: score</p>
      ) : null}

      {STEPS[step] === "stepRewards" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldWinnerXp")}
            <input
              className="tap-input"
              type="number"
              min={0}
              value={winnerXp}
              onChange={(e) => { setWinnerXp(Math.max(0, Number(e.target.value) || 0)) } }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldParticipationXp")}
            <input
              className="tap-input"
              type="number"
              min={0}
              value={participationXp}
              onChange={(e) => {
                setParticipationXp(Math.max(0, Number(e.target.value) || 0));
              }}
            />
          </label>
        </div>
      ) : null}

      {STEPS[step] === "stepReview" ? (
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="font-bold">{t("fieldTitle")}:</dt>
            <dd>{title || "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-bold">{t("fieldGame")}:</dt>
            <dd>{gameSlugs.join(", ") || "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-bold">{t("fieldAttemptLimit")}:</dt>
            <dd>{attemptLimit}</dd>
          </div>
        </dl>
      ) : null}

      <div className="flex gap-2">
        {step > 0 ? (
          <button
            type="button"
            className="tap-btn tap-btn-secondary"
            onClick={() => { setStep(step - 1) } }
          >
            {t("back")}
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="tap-btn tap-btn-primary"
            disabled={!canNext}
            onClick={() => { setStep(step + 1) } }
          >
            {t("next")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="tap-btn tap-btn-secondary"
              disabled={saving || !validBasic || !validGame || !validSchedule}
              onClick={() => { void save(false) } }
            >
              {t("saveDraft")}
            </button>
            {!initial.id ? (
              <button
                type="button"
                className="tap-btn tap-btn-primary"
                disabled={saving || !validBasic || !validGame || !validSchedule}
                onClick={() => { void save(true) } }
              >
                {t("publish")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
