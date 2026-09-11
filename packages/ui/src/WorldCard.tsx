import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "./Badge";
import { ProgressBar } from "./ProgressBar";
import { cx } from "./cx";

export interface WorldCardProps {
  title: ReactNode;
  description?: ReactNode;
  art?: ReactNode;
  status?: "locked" | "current" | "complete";
  statusLabel?: ReactNode;
  progress?: number;
  action?: ReactNode;
  className?: string;
}

const STATUS_TONE: Record<NonNullable<WorldCardProps["status"]>, BadgeTone> = {
  locked: "neutral",
  current: "primary",
  complete: "success",
};

/** Adventure-world tile: art, status pill, progress, entry action. */
export function WorldCard({
  title,
  description,
  art,
  status = "locked",
  statusLabel,
  progress,
  action,
  className,
}: WorldCardProps) {
  return (
    <article className={cx("tap-world", className)}>
      {art ? (
        <div className="tap-world-art" aria-hidden="true">
          {art}
        </div>
      ) : null}
      <div className="tap-world-body">
        <div className="tap-world-top">
          <h3 className="tap-world-title">{title}</h3>
          {statusLabel ? (
            <Badge tone={STATUS_TONE[status]}>{statusLabel}</Badge>
          ) : null}
        </div>
        {description ? <p className="tap-world-desc">{description}</p> : null}
        {typeof progress === "number" ? (
          <ProgressBar value={progress} max={100} />
        ) : null}
        {action}
      </div>
    </article>
  );
}
