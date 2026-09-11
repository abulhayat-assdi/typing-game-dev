import type { ReactNode } from "react";
import { cx } from "./cx";

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
  className?: string;
}

/** Section heading inside pages/cards. */
export function SectionHeader({
  title,
  description,
  actions,
  level = 2,
  className,
}: SectionHeaderProps) {
  const Tag = level === 3 ? "h3" : "h2";
  return (
    <div className={cx("tap-section-head", className)}>
      <div>
        <Tag className="tap-section-title">{title}</Tag>
        {description ? (
          <p className="tap-section-desc">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="tap-section-actions">{actions}</div> : null}
    </div>
  );
}
