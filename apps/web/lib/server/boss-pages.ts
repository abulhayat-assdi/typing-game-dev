/**
 * Shared boss-page wiring (M12): session gate + user-scoped store.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseBossStore,
  type BossStore,
} from "./boss-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface BossPageContext {
  session: Session;
  store: BossStore;
  locale: Locale;
}

export async function bossPageContext(
  locale: Locale,
): Promise<BossPageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseBossStore(client), locale };
}
