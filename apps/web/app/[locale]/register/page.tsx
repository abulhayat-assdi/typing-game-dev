import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../lib/i18n";
import { RegisterForm } from "../../../components/register-form";

export default function RegisterPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "auth");
  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center p-6">
      <PageHeader title={t("registerTitle")} />
      <Card>
        <CardContent>
          <RegisterForm locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}
