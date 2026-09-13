/**
 * Shared rewards-page wiring (M17): session gate + user-scoped store.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseRewardedStore,
  type RewardedStore,
} from "./rewarded-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface RewardedPageContext {
  session: Session;
  store: RewardedStore;
  locale: Locale;
}

export async function rewardedPageContext(
  locale: Locale,
): Promise<RewardedPageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseRewardedStore(client), locale };
}
