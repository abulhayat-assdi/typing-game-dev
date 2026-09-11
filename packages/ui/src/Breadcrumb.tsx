import { Fragment, type ReactNode } from "react";
import { cx } from "./cx";

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export interface BreadcrumbProps {
  items: Crumb[];
  label?: string;
  className?: string;
}

/** Breadcrumb trail (aria-labelled nav + ordered list). */
export function Breadcrumb({
  items,
  label = "Breadcrumb",
  className,
}: BreadcrumbProps) {
  return (
    <nav aria-label={label} className={cx("tap-crumbs", className)}>
      <ol>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              <li aria-current={last ? "page" : undefined}>
                {item.href && !last ? (
                  <a href={item.href} className="tap-crumb-link">
                    {item.label}
                  </a>
                ) : (
                  <span className="tap-crumb-current">{item.label}</span>
                )}
              </li>
              {last ? null : (
                <li aria-hidden="true" className="tap-crumb-sep">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
