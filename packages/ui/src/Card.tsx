import type { ReactNode } from "react";
import { cx } from "./cx";

export interface CardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}

/** Surface card + composable sections. */
export function Card({ children, className, interactive = false }: CardProps) {
  return (
    <div className={cx("tap-card", interactive && "tap-card-interactive", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("tap-card-head", className)}>{children}</div>;
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h3 className={cx("tap-card-title", className)}>{children}</h3>;
}

export function CardDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cx("tap-card-desc", className)}>{children}</p>;
}

export function CardContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("tap-card-body", className)}>{children}</div>;
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("tap-card-foot", className)}>{children}</div>;
}
