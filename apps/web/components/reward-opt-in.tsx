"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/**
 * Honest opt-in flow: offer → opt-in → start → provider experience →
 * complete → verify → grant, every step server-decided. Copy never
 * implies obligation, support, or clicks. The mock modal is explicitly
 * labeled development-only (no fake ad progress theater).
 */
export function RewardOptIn({
  locale,
  rewardSlug,
  rewardLabel,
  placement,
  provider,
}: {
  locale: Locale;
  rewardSlug: string;
  rewardLabel: string;
  placement: string;
  provider: string;
}) {
  const t = getTranslator(locale, "rewards");
  const router = useRouter();
  const [stage, setStage] = useState<
    "idle" | "offered" | "mock" | "done" | "empty" | "failed"
  >("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [providerReference, setProviderReference] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(path: string, body?: unknown): Promise<Response | null> {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      return res;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function begin(): Promise<void> {
    const offer = await post("/api/rewards/ads/offer", {
      placement,
      rewardSlug,
    });
    if (!offer || !offer.ok) {
      setStage(offer && offer.status === 409 ? "empty" : "failed");
      return;
    }
    const { sessionId: sid } = (await offer.json()) as { sessionId: string };
    const opt = await post(`/api/rewards/ads/${sid}/opt-in`);
    if (!opt || !opt.ok) {
      setStage("failed");
      return;
    }
    const started = await post(`/api/rewards/ads/${sid}/start`);
    if (!started || !started.ok) {
      setStage("failed");
      return;
    }
    const { providerReference: ref } = (await started.json()) as {
      providerReference: string;
    };
    setSessionId(sid);
    setProviderReference(ref);
    // Mock provider only: Google Offerwall renders its own managed UI
    // and never reaches this client modal (fail-closed server-side).
    setStage("mock");
  }

  async function finish(): Promise<void> {
    if (!sessionId || !providerReference) {
      setStage("failed");
      return;
    }
    const done = await post(`/api/rewards/ads/${sessionId}/complete`, {
      providerReference,
    });
    if (!done || !done.ok) {
      setStage("failed");
      return;
    }
    setStage("done");
    router.refresh();
  }

  if (stage === "done") {
    return <p className="text-sm text-green-700">{t("rewardGranted")}</p>;
  }
  // Google Offerwall renders its own managed choice UI; custom
  // in-app grants stay fail-closed server-side, so no client modal.
  if (provider !== "mock") {
    return null;
  }
  if (stage === "empty") {
    return <p className="text-sm text-ink-muted">{t("noFill")}</p>;
  }
  if (stage === "failed") {
    return <p className="text-sm text-ink-muted">{t("verifyFailed")}</p>;
  }
  if (stage === "mock" && sessionId) {
    return (
      <div className="flex flex-col gap-2 rounded border p-3" role="dialog" aria-label={t("mockOnly")}>
        <p className="text-sm font-bold">{t("mockOnly")}</p>
        <p className="text-sm text-ink-muted">{t("mockNotice")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="tap-btn tap-btn-primary tap-btn-sm"
            disabled={busy}
            onClick={() => {
              void finish();
            }}
          >
            {t("simulateComplete")}
          </button>
          <button
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-sm"
            disabled={busy}
            onClick={() => {
              setStage("idle");
              setSessionId(null);
              void post(`/api/rewards/ads/${sessionId}/cancel`);
            }}
          >
            {t("notNow")}
          </button>
        </div>
      </div>
    );
  }
  if (stage === "offered" || stage === "idle") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          {t("watchAd")} · {t("rewardLabel")}: {rewardLabel}
        </p>
        <p className="text-xs text-ink-muted">{t("optInBlurb")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="tap-btn tap-btn-primary tap-btn-sm"
            disabled={busy}
            onClick={() => {
              setStage("offered");
              void begin();
            }}
          >
            {t("watchAd")}
          </button>
          <button
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-sm"
            disabled={busy}
            onClick={() => {
              setStage("idle");
            }}
          >
            {t("notNow")}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
