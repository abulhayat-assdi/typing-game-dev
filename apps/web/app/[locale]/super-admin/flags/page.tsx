import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { getSession } from "../../../../lib/server/auth";
import { userDbClient } from "../../../../lib/server/auth";
import { requireSuperAdmin } from "../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../lib/server/staff-store";
import { ForbiddenBlock } from "../../../../components/forbidden-block";
import { FlagToggle } from "../../../../components/admin-forms";

export default async function SuperFlagsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) return <ForbiddenBlock locale={locale} />;
  let flags: Array<{ key: string; enabled: boolean; description: string }> = [];
  try {
    await requireSuperAdmin(client);
    flags = await createSupabaseStaffStore(client).getFlags();
  } catch {
    return <ForbiddenBlock locale={locale} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("featureFlags")} />
      <Card>
        <CardContent>
          <div className="flex flex-col gap-2">
            {flags.map((f) => (
              <FlagToggle
                key={f.key}
                locale={locale}
                flagKey={f.key}
                enabled={f.enabled}
                description={f.description}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
