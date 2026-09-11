"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Idempotent logout button (server clears httpOnly cookies). */
export function LogoutButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = getTranslator(locale, "auth");
  const [busy, setBusy] = useState(false);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* logout never strands the UI */
    }
    router.push(`/${locale}/login`);
    router.refresh();
  }

  return (
    <button
      type="button"
      className="tap-btn tap-btn-secondary tap-btn-sm"
      disabled={busy}
      onClick={() => void logout()}
    >
      {t("logout")}
    </button>
  );
}
