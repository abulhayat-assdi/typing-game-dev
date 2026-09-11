import type { ReactNode } from "react";
import { cx } from "./cx";

export interface GameHudShellProps {
  score?: ReactNode;
  accuracy?: ReactNode;
  streak?: ReactNode;
  timer?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  label?: string;
  className?: string;
}

/**
 * In-game HUD frame: metric slots on top, stage below. All values are
 * display slots — scoring/validation always happens server-side.
 */
export function GameHudShell({
  score,
  accuracy,
  streak,
  timer,
  actions,
  children,
  label = "Game",
  className,
}: GameHudShellProps) {
  return (
    <section aria-label={label} className={cx("tap-hud", className)}>
      <div className="tap-hud-bar">
        {score ? <div className="tap-hud-metric">{score}</div> : null}
        {accuracy ? <div className="tap-hud-metric">{accuracy}</div> : null}
        {streak ? <div className="tap-hud-metric">{streak}</div> : null}
        {timer ? <div className="tap-hud-metric">{timer}</div> : null}
        {actions ? <div className="tap-hud-actions">{actions}</div> : null}
      </div>
      <div className="tap-hud-stage">{children}</div>
    </section>
  );
}
