/** Tiny class-name joiner (no dependency): strings, false/null/undefined-safe. */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
