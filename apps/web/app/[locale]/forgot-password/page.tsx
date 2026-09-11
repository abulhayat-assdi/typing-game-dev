import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../lib/i18n";
import { ForgotPasswordForm } from "../../../components/password-forms";

export default function ForgotPasswordPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "auth");
  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center p-6">
      <PageHeader title={t("forgotPassword")} />
      <Card>
        <CardContent>
          <ForgotPasswordForm locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}
