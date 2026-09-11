import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToastProvider } from "@tap/ui";
import "../../styles/globals.css";
import { AppHeader } from "../../components/app-header";
import { ThemeProvider } from "../../components/theme-provider";
import {
  LOCALES,
  getMessages,
  getTranslator,
  isLocale,
  type Locale,
} from "../../lib/i18n";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "home");
  const common = getTranslator(locale, "common");
  return { title: t("title"), description: t("subtitle"), applicationName: common("appName") };
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const messages = getMessages(locale);
  const a11y = getTranslator(locale, "a11y");

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <a href="#main-content" className="tap-sr-only">
          {a11y("skipToContent")}
        </a>
        <ThemeProvider>
          <ToastProvider dismissLabel={messages.a11y.dismissAlert}>
            <AppHeader locale={locale} />
            <main id="main-content">{children}</main>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
