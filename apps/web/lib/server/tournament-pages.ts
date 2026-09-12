/**
 * Shared tournament-page wiring (M14): session gate + user-scoped store.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseTournamentStore,
  type TournamentStore,
} from "./tournament-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface TournamentPageContext {
  session: Session;
  store: TournamentStore;
  locale: Locale;
}

export async function tournamentPageContext(
  locale: Locale,
): Promise<TournamentPageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseTournamentStore(client), locale };
}
