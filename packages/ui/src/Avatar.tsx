import { cx } from "./cx";

export interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Profile avatar with initials fallback (no external image dependency). */
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cx("tap-avatar", `tap-avatar-${size}`, className)}
      role="img"
      aria-label={name}
    >
      {src ? (
        // Plain img is intentional: R2 URLs bypass the Next optimizer (Workers-safe).
        <img src={src} alt="" className="tap-avatar-img" loading="lazy" />
      ) : (
        <span aria-hidden="true">{initials || "?"}</span>
      )}
    </span>
  );
}
