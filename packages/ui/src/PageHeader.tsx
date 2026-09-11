import type { ReactNode } from "react";
import { cx } from "./cx";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: ReactNode;
  className?: string;
}

/** Page top block: optional breadcrumbs, title, description, actions. */
export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx("tap-page-head", className)}>
      {crumbs}
      <div className="tap-page-head-row">
        <div>
          <h1 className="tap-page-title">{title}</h1>
          {description ? (
            <p className="tap-page-desc">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="tap-page-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
