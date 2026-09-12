/**
 * Shared clan-page wiring (M10): session gate + user-scoped store.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseClanStore,
  type ClanStore,
} from "./clan-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface ClanPageContext {
  session: Session;
  store: ClanStore;
  locale: Locale;
}

export async function clanPageContext(
  locale: Locale,
): Promise<ClanPageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseClanStore(client), locale };
}
