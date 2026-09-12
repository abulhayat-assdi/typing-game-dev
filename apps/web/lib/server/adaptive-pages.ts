/**
 * Shared adaptive-page wiring (M15): session gate + user-scoped store.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseAdaptiveStore,
  type AdaptiveStore,
} from "./adaptive-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface AdaptivePageContext {
  session: Session;
  store: AdaptiveStore;
  locale: Locale;
}

export async function adaptivePageContext(
  locale: Locale,
): Promise<AdaptivePageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseAdaptiveStore(client), locale };
}
