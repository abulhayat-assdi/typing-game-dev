import { redirect } from "next/navigation";
import { StudentNav } from "../../../components/student-nav";
import { getSession } from "../../../lib/server/auth";
import { userDbClient } from "../../../lib/server/auth";
import { getCurrentActor } from "../../../lib/server/staff";
import { isLocale, type Locale } from "../../../lib/i18n";
import { loginUrl } from "../../../lib/routes";

/**
 * Student area gate (backstop — middleware normally redirects first, with
 * the destination preserved). Requires an ACTIVE account: suspended or
 * inactive users land on /suspended with zero private data rendered.
 * No admin functionality lives under here.
 *
 * force-dynamic is load-bearing: getSession() reads cookies() inside a
 * try/catch (fail-closed nulls), which would otherwise swallow Next's
 * dynamic bailout and bake a logged-out redirect into static HTML.
 */
export const dynamic = "force-dynamic";
export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  const actor = client ? await getCurrentActor(client) : null;
  if (!actor || actor.status !== "active") {
    redirect(`/${locale}/suspended`);
  }
  return (
    <div className="min-h-screen bg-canvas">
      <StudentNav locale={locale} />
      <div className="mx-auto w-full max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
