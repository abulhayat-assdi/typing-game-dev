import type { ReactNode } from "react";
import { cx } from "./cx";

export interface RewardCardProps {
  title: ReactNode;
  description?: ReactNode;
  art?: ReactNode;
  amount?: ReactNode;
  action?: ReactNode;
  claimed?: boolean;
  claimedLabel?: ReactNode;
  className?: string;
}

/** Chest/reward reveal card (visual only — issuance stays server-side). */
export function RewardCard({
  title,
  description,
  art,
  amount,
  action,
  claimed = false,
  claimedLabel,
  className,
}: RewardCardProps) {
  return (
    <article className={cx("tap-reward", claimed && "tap-reward-claimed", className)}>
      {art ? (
        <div className="tap-reward-art" aria-hidden="true">
          {art}
        </div>
      ) : null}
      <h3 className="tap-reward-title">{title}</h3>
      {description ? <p className="tap-reward-desc">{description}</p> : null}
      {amount ? <p className="tap-reward-amount">{amount}</p> : null}
      {claimed ? claimedLabel : action}
    </article>
  );
}
