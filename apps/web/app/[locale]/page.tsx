import { isLocale, type Locale } from "../../lib/i18n";
import { LandingPage } from "../../components/landing-page";

export default function HomePage({
  params,
}: {
  params: { locale: string };
}) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  return <LandingPage locale={locale} />;
}
