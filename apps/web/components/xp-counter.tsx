"use client";

import { useEffect, useState } from "react";

/**
 * Animated counter (XP gains, stats). Respects reduced motion by rendering
 * the final value immediately; never blocks input (pure display).
 */
export function XpCounter({
  value,
  durationMs = 900,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      durationMs <= 0
    ) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); };
  }, [value, durationMs]);
  return (
    <span className={className} aria-label={String(value)}>
      {shown}
    </span>
  );
}
