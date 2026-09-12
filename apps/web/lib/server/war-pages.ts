/**
 * Shared war-page wiring (M11): session gate + user-scoped store.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import { createSupabaseWarStore, type WarStore } from "./war-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface WarPageContext {
  session: Session;
  store: WarStore;
  locale: Locale;
}

export async function warPageContext(locale: Locale): Promise<WarPageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseWarStore(client), locale };
}
