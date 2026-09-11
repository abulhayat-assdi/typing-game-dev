/**
 * Shared student-page wiring (M6): session gate + user-scoped store.
 * Every student page reads through RLS as the logged-in user; failures
 * surface through the locale error boundary (translated).
 */
import { redirect } from "next/navigation";
import { getSession } from "./auth";
import { userDbClient } from "./auth";
import { createSupabaseStudentStore, type StudentStore } from "./student-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";
import type { Session } from "./auth";

export interface StudentContext {
  session: Session;
  store: StudentStore;
  locale: Locale;
}

export async function studentContext(locale: Locale): Promise<StudentContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseStudentStore(client), locale };
}
