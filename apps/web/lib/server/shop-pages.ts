/**
 * Shared shop-page wiring (M16): session gate + user-scoped store.
 */
import { redirect } from "next/navigation";
import { getSession, userDbClient, type Session } from "./auth";
import {
  createSupabaseShopStore,
  type ShopStore,
} from "./shop-store";
import { loginUrl } from "../../lib/routes";
import type { Locale } from "../../lib/i18n";

export interface ShopPageContext {
  session: Session;
  store: ShopStore;
  locale: Locale;
}

export async function shopPageContext(
  locale: Locale,
): Promise<ShopPageContext> {
  const session = await getSession();
  if (!session) redirect(loginUrl(locale));
  const client = await userDbClient();
  if (!client) throw new Error("SERVICE_UNAVAILABLE");
  return { session, store: createSupabaseShopStore(client), locale };
}
