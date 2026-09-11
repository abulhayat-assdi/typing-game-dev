import { ForbiddenBlock } from "../../../components/forbidden-block";
import { StaffNav } from "../../../components/staff-nav";
import { getSession } from "../../../lib/server/auth";
import { userDbClient } from "../../../lib/server/auth";
import { requireSuperAdmin } from "../../../lib/server/staff";
import { AuthApiError } from "../../../lib/server/staff";
import { isLocale, getTranslator, type Locale } from "../../../lib/i18n";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  let allowed = false;
  if (client) {
    try {
      await requireSuperAdmin(client);
      allowed = true;
    } catch (e) {
      if (!(e instanceof AuthApiError)) throw e;
    }
  }
  if (!allowed) return <ForbiddenBlock locale={locale} />;
  const t = getTranslator(locale, "staff");
  const base = `/${locale}/super-admin`;
  return (
    <div className="min-h-screen bg-canvas">
      <StaffNav
        locale={locale}
        homeHref={base}
        items={[
          { href: base, label: t("superDashboard") },
          { href: `${base}/audit`, label: t("auditLog") },
          { href: `${base}/flags`, label: t("featureFlags") },
        ]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
