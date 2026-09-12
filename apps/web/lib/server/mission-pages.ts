/**
 * Shared mission-page wiring (M9): session gate + user-scoped store.
 * Reads go through RLS as the logged-in user.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseMissionStore,
  type MissionStore,
} from "./mission-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface MissionPageContext {
  session: Session;
  store: MissionStore;
  locale: Locale;
}

export async function missionPageContext(
  locale: Locale,
): Promise<MissionPageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseMissionStore(client), locale };
}
