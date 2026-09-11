/**
 * Shared competition-page wiring (M8): session gate + user-scoped store.
 * Reads go through RLS as the logged-in user; role gates live in
 * lib/server/staff (teachers/admins) and the API layer.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseCompetitionStore,
  type CompetitionStore,
} from "./competition-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface CompetitionContext {
  session: Session;
  store: CompetitionStore;
  locale: Locale;
}

export async function competitionPageContext(
  locale: Locale,
): Promise<CompetitionContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseCompetitionStore(client), locale };
}
