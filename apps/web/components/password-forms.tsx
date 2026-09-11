"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Input } from "@tap/ui";
import { browserClient } from "../lib/supabase-browser";
import { publicEnv } from "../lib/env-public";
import { validateEmail } from "../lib/auth-flow";
import { getTranslator, type Locale } from "../lib/i18n";

/** Request a password-reset link (same message regardless of outcome). */
export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "auth");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (validateEmail(email)) {
      setError(t("signInRequired"));
      return;
    }
    const client = browserClient();
    if (!client) {
      setError(t("signInRequired"));
      return;
    }
    setBusy(true);
    try {
      await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${publicEnv.appUrl}/${locale}/reset-password`,
      });
    } catch {
      /* enumeration-safe: same message either way */
    }
    setBusy(false);
    setSent(true);
  }

  if (sent) return <Alert tone="info">{t("resetSent")}</Alert>;

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <Input
        label={t("email")}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); }}
        required
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" loading={busy}>
        {t("sendResetLink")}
      </Button>
      <p className="text-center text-sm">
        <Link href={`/${locale}/login`} className="tap-link-btn">
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}

/** Set a new password from a recovery session. */
export function ResetPasswordForm({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (password !== confirm || password.length < 8) {
      setError(t("passwordsMismatch"));
      return;
    }
    const client = browserClient();
    if (!client) {
      setError(t("signInRequired"));
      return;
    }
    setBusy(true);
    const { error: updateError } = await client.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(t("signInRequired"));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="success">{t("submitReset")}</Alert>
        <Link href={`/${locale}/login`} className="tap-btn tap-btn-primary tap-btn-md">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <Input
        label={t("newPassword")}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); }}
        required
      />
      <Input
        label={t("confirmPassword")}
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => { setConfirm(e.target.value); }}
        required
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" loading={busy}>
        {t("submitReset")}
      </Button>
    </form>
  );
}
