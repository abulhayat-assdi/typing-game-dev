"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@tap/ui";
import { browserClient } from "../lib/supabase-browser";
import {
  landingForRoles,
  loginGate,
  validateEmail,
  validateRequired,
  type AppRole,
} from "../lib/auth-flow";
import { getTranslator, type Locale } from "../lib/i18n";

export interface LoginStrings {
  email: string;
  password: string;
  submit: string;
  forgot: string;
  invalid: string;
  suspended: string;
  inactive: string;
  backHome: string;
}
export function LoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = getTranslator(locale, "auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strings: LoginStrings = {
    email: t("email"),
    password: t("password"),
    submit: t("submitLogin"),
    forgot: t("forgotPassword"),
    invalid: t("invalidCredentials"),
    suspended: t("accountSuspended"),
    inactive: t("accountInactive"),
    backHome: t("backToLogin"),
  };

  async function submit(e: React.SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (validateEmail(email) || validateRequired(password)) {
      setError(strings.invalid);
      return;
    }
    const client = browserClient();
    if (!client) {
      setError(strings.invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw new Error(signInError.message);
      const actorRes = await fetch("/api/auth/actor", { credentials: "same-origin" });
      if (!actorRes.ok) throw new Error("actor");
      const body = (await actorRes.json()) as {
        actor: {
          roles: AppRole[];
          status: "active" | "inactive" | "suspended";
        };
      };
      const gate = loginGate(body.actor.status);
      if (gate) {
        await fetch("/api/auth/logout", { method: "POST" });
        setError(gate === "suspended" ? strings.suspended : strings.inactive);
        setBusy(false);
        return;
      }
      router.push(landingForRoles(body.actor.roles, locale));
      router.refresh();
    } catch {
      // Deliberately generic: never reveal whether the email exists.
      setError(strings.invalid);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <Input
        label={strings.email}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); }}
        required
      />
      <Input
        label={strings.password}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); }}
        required
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" loading={busy}>
        {strings.submit}
      </Button>
      <div className="flex justify-between text-sm">
        <Link href={`/${locale}/forgot-password`} className="tap-link-btn">
          {strings.forgot}
        </Link>
        <Link href={`/${locale}`} className="tap-link-btn">
          {strings.backHome}
        </Link>
      </div>
    </form>
  );
}
