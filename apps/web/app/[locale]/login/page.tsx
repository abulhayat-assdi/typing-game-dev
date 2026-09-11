import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../lib/i18n";
import { LoginForm } from "../../../components/login-form";

export default function LoginPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "auth");
  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center p-6">
      <PageHeader title={t("loginTitle")} />
      <Card>
        <CardContent>
          <LoginForm locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}
