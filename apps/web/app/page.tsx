import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "../lib/i18n";

// Root `/` redirects to the default locale. No locale detection magic in M1.
export default function RootPage() {
  redirect(`/${DEFAULT_LOCALE}`);
}
