"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Purchase button with confirm step; idempotency key per click session. */
export function PurchaseButton({
  locale,
  itemId,
  priceCoins,
  clanId,
}: {
  locale: Locale;
  itemId: string;
  priceCoins: number;
  clanId?: string;
}) {
  const t = getTranslator(locale, "shop");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());

  async function buy(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/shop/${itemId}/purchase`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          clanId ? { requestId, clanId } : { requestId },
        ),
      });
      if (!res.ok) {
        setFailed(true);
        setConfirming(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setFailed(true);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="text-sm text-green-700">{t("purchaseSuccess")}</p>;
  }
  if (!confirming) {
    return (
      <button
        type="button"
        className="tap-btn tap-btn-primary tap-btn-sm"
        disabled={busy}
        onClick={() => {
          setFailed(false);
          setConfirming(true);
        }}
      >
        {t("buy")} · {priceCoins} {t("coins")}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
      <p className="text-sm">
        {t("confirmBuy")} · {priceCoins} {t("coins")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="tap-btn tap-btn-primary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void buy();
          }}
        >
          {t("confirmBuy")}
        </button>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
          }}
        >
          {t("back")}
        </button>
      </div>
    </div>
  );
}
