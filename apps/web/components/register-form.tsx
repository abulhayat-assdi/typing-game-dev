"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Radio } from "@tap/ui";
import { browserClient } from "../lib/supabase-browser";
import {
  landingForRoles,
  loginGate,
  validateEmail,
  validateRegistration,
  type AppRole,
} from "../lib/auth-flow";
import { getTranslator, type Locale } from "../lib/i18n";

const STEPS = ["batch", "details", "skill", "account"] as const;
type Step = (typeof STEPS)[number];

/**
 * Stepped student registration (batch → details → skill → account).
 * Creates the Supabase Auth user, then completes enrollment through
 * POST /api/auth/register (atomic fn_register_with_batch server-side).
 */
export function RegisterForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = getTranslator(locale, "auth");
  const te = getTranslator(locale, "errors");
  const [step, setStep] = useState<Step>("batch");
  const [joinCode, setJoinCode] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [skillTrack, setSkillTrack] = useState("beginner");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const idx = STEPS.indexOf(step);

  function next(): void {
    setError(null);
    if (step === "batch" && joinCode.trim() === "") {
      setError(t("invalidBatchCode"));
      return;
    }
    if (step === "details") {
      if (!rollNumber.trim() || !fullName.trim()) {
        setError(te("requiredField"));
        return;
      }
      if (validateEmail(email)) {
        setError(te("invalidEmail"));
        return;
      }
    }
    if (step === "skill") setStep("account");
    else if (step === "batch") setStep("details");
    else if (step === "details") setStep("skill");
  }

  async function submit(): Promise<void> {
    const problems = validateRegistration({
      joinCode,
      rollNumber,
      fullName,
      email,
      password,
      confirmPassword,
      skillTrack,
      terms,
    });
    if (Object.keys(problems).length > 0) {
      const first = Object.values(problems)[0];
      setError(
        first === "mismatch"
          ? t("passwordsMismatch")
          : first === "weak-password"
            ? t("weakPassword")
            : first === "terms-required"
              ? t("termsRequired")
              : first === "invalid-email"
                ? te("invalidEmail")
                : te("requiredField"),
      );
      return;
    }
    const client = browserClient();
    if (!client) {
      setError(te("networkDescription"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: signUpError } = await client.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) {
        // Generic message either way: never confirm email existence.
        setError(t("checkEmail"));
        setBusy(false);
        return;
      }
      if (!data.session) {
        setNeedsConfirm(true);
        setBusy(false);
        return;
      }
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          joinCode: joinCode.trim(),
          rollNumber: rollNumber.trim(),
          fullName: fullName.trim(),
          skillTrack,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (body.error === "ROLL_TAKEN") setError(t("rollTaken"));
        else if (body.error === "ALREADY_ENROLLED") setError(t("alreadyEnrolled"));
        else if (body.error === "INVALID_JOIN_CODE") setError(t("invalidBatchCode"));
        else setError(te("genericDescription"));
        setBusy(false);
        return;
      }
      const actorRes = await fetch("/api/auth/actor", {
        credentials: "same-origin",
      });
      const actorBody = (await actorRes.json()) as {
        actor: { roles: AppRole[]; status: string };
      };
      const gate = loginGate(
        actorBody.actor.status as "active" | "inactive" | "suspended",
      );
      if (gate) {
        setError(
          gate === "suspended" ? t("accountSuspended") : t("accountInactive"),
        );
        setBusy(false);
        return;
      }
      router.push(landingForRoles(actorBody.actor.roles, locale));
      router.refresh();
    } catch {
      setError(te("networkDescription"));
      setBusy(false);
    }
  }

  if (needsConfirm) {
    return <Alert tone="info" title={t("accountCreated")}>{t("checkEmail")}</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex gap-2 text-xs font-semibold" aria-label="progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={s === step ? "step" : undefined}
            className={
              i <= idx ? "tap-badge tap-badge-primary" : "tap-badge tap-badge-neutral"
            }
          >
            {t(
              s === "batch"
                ? "stepBatch"
                : s === "details"
                  ? "stepDetails"
                  : s === "skill"
                    ? "stepSkill"
                    : "stepAccount",
            )}
          </li>
        ))}
      </ol>

      {step === "batch" ? (
        <Input
          label={t("batchCode")}
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value); }}
          autoComplete="off"
          required
        />
      ) : null}

      {step === "details" ? (
        <>
          <Input
            label={t("rollNumber")}
            value={rollNumber}
            onChange={(e) => { setRollNumber(e.target.value); }}
            autoComplete="off"
            required
          />
          <Input
            label={t("fullName")}
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); }}
            autoComplete="name"
            required
          />
          <Input
            label={t("email")}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); }}
            autoComplete="email"
            required
          />
        </>
      ) : null}

      {step === "skill" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="tap-label">{t("skillTrack")}</legend>
          {(
            [
              ["beginner", t("skillBeginner")],
              ["intermediate", t("skillIntermediate")],
              ["expert", t("skillExpert")],
            ] as const
          ).map(([value, label]) => (
            <Radio
              key={value}
              name="skill-track"
              value={value}
              checked={skillTrack === value}
              onChange={() => { setSkillTrack(value); }}
              label={label}
            />
          ))}
        </fieldset>
      ) : null}

      {step === "account" ? (
        <>
          <Input
            label={t("password")}
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); }}
            autoComplete="new-password"
            required
          />
          <Input
            label={t("confirmPassword")}
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); }}
            autoComplete="new-password"
            required
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => { setTerms(e.target.checked); }}
            />
            {t("acceptTerms")}
          </label>
        </>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex justify-between gap-2">
        {idx > 0 ? (
          <button
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-md"
            onClick={() => { setStep(STEPS[idx - 1] as Step); }}
          >
            {t("prevStep")}
          </button>
        ) : (
          <span />
        )}
        {step !== "account" ? (
          <button
            type="button"
            className="tap-btn tap-btn-primary tap-btn-md"
            onClick={next}
          >
            {t("nextStep")}
          </button>
        ) : (
          <Button loading={busy} onClick={() => void submit()}>
            {t("submitRegister")}
          </Button>
        )}
      </div>

      <p className="text-center text-sm">
        <Link href={`/${locale}/login`} className="tap-link-btn">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
