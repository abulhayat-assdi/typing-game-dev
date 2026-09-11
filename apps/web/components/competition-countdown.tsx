"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "../lib/competitions";

/**
 * Presentation-only countdown anchored to server timestamps shipped with the
 * page (serverNow + target). Ticks locally from mount; eligibility and
 * validity are always decided server-side. Tab suspension only pauses the
 * paint — the anchor math restores the true value on return.
 */
export function CompetitionCountdown({
  serverNowIso,
  targetIso,
  label,
}: {
  serverNowIso: string;
  targetIso: string;
  label: string;
}) {
  const [, setRender] = useState(0);
  const [anchor] = useState(() => ({
    serverNow: Date.parse(serverNowIso),
    clientAtMount: Date.now(),
  }));
  useEffect(() => {
    const id = window.setInterval(() => {
      setRender((n) => n + 1);
    }, 1000);
    const onVisible = () => {
      setRender((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const target = Date.parse(targetIso);
  if (!Number.isFinite(anchor.serverNow) || !Number.isFinite(target)) {
    return null;
  }
  const estimatedServerNow =
    anchor.serverNow + (Date.now() - anchor.clientAtMount);
  const remaining = Math.max(0, target - estimatedServerNow);
  return (
    <p className="text-sm text-ink-muted" suppressHydrationWarning>
      {label}: {formatCountdown(remaining)}
    </p>
  );
}
