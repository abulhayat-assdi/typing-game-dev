import { Badge, Card, CardContent, PageHeader } from "@tap/ui";
import { getTranslator, type Locale } from "../../lib/i18n";

export default function HomePage({
  params,
}: {
  params: { locale: string };
}) {
  const locale: Locale = params.locale === "bn" ? "bn" : "en";
  const t = getTranslator(locale, "home");
  const common = getTranslator(locale, "common");

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
      />
      <Badge tone="primary">{common("tagline")}</Badge>
      <Card className="w-full">
        <CardContent>
          <p className="text-sm text-ink-muted">{t("foundationNote")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
