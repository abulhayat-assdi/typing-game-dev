/**
 * Shared season-page wiring (M13): session gate + user-scoped store.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseSeasonStore,
  type SeasonStore,
} from "./season-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface SeasonPageContext {
  session: Session;
  store: SeasonStore;
  locale: Locale;
}

export async function seasonPageContext(
  locale: Locale,
): Promise<SeasonPageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseSeasonStore(client), locale };
}
