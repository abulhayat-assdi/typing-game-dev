import { ForbiddenBlock } from "../../../components/forbidden-block";
import { StaffNav } from "../../../components/staff-nav";
import { getSession } from "../../../lib/server/auth";
import { userDbClient } from "../../../lib/server/auth";
import { requireTeacher } from "../../../lib/server/staff";
import { AuthApiError } from "../../../lib/server/staff";
import { isLocale, getTranslator, type Locale } from "../../../lib/i18n";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({
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
      await requireTeacher(client);
      allowed = true;
    } catch (e) {
      if (!(e instanceof AuthApiError)) throw e;
    }
  }
  if (!allowed) return <ForbiddenBlock locale={locale} />;
  const t = getTranslator(locale, "staff");
  const tn = getTranslator(locale, "nav");
  return (
    <div className="min-h-screen bg-canvas">
      <StaffNav
        locale={locale}
        homeHref={`/${locale}/teacher`}
        items={[
          { href: `/${locale}/teacher`, label: t("teacherDashboard") },
          {
            href: `/${locale}/teacher/competitions`,
            label: tn("competitions"),
          },
          {
            href: `/${locale}/teacher/clan`,
            label: tn("clan"),
          },
        ]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
