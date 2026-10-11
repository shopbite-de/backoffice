import type { H3Event } from "h3";

export interface SalesChannel {
  id: string;
  name: string;
  navigationCategoryId: string;
  currencyId: string;
  languageId: string;
  menuCategoryId: string;
}

interface SalesChannelRow {
  id: string;
  translated: { name: string };
  navigationCategoryId: string;
  currencyId: string;
  languageId: string;
}

/** NUXT_SALES_CHANNELS: "channelId:menuCategoryId,..." (menu category optional, the plugin configuration knows it). */
function configuredChannels() {
  return useRuntimeConfig()
    .salesChannels.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, menuCategoryId] = entry.split(":");
      return { id: id!, menuCategoryId: menuCategoryId || undefined };
    });
}

const MENU_CACHE_MS = 60_000;
let menuCache: { at: number; byChannel: Record<string, string> } | null = null;

/**
 * Menu category per sales channel from the plugin configuration (shopware-plugin#35, falls back
 * to the navigation category there). Kept for a minute: it changes rarely and every request
 * needs it. An older plugin without the route means: navigation category.
 */
async function pluginMenuCategories(event: H3Event): Promise<Record<string, string>> {
  if (menuCache && Date.now() - menuCache.at < MENU_CACHE_MS) return menuCache.byChannel;
  try {
    const { channels } = await adminApi<{ channels: Record<string, { menuCategoryId?: string }> }>(
      event,
      "/_action/shopbite/settings",
    );
    const byChannel = Object.fromEntries(
      Object.entries(channels).flatMap(([id, s]) => (s.menuCategoryId ? [[id, s.menuCategoryId]] : [])),
    );
    menuCache = { at: Date.now(), byChannel };
    return byChannel;
  } catch {
    return {};
  }
}

/**
 * The branches (sales channels) the logged-in person works for: the
 * configured list in its order, else every active channel of the instance,
 * narrowed to the person's own branches (user custom field, see profile.ts).
 */
export async function restaurantChannels(event: H3Event): Promise<SalesChannel[]> {
  const configured = configuredChannels();
  const { channelIds } = (await useShopwareSession(event)).data;
  const listed = configured.map((c) => c.id);
  const filter: Record<string, unknown>[] = listed.length
    ? [{ type: "equalsAny", field: "id", value: listed }]
    : [{ type: "equals", field: "active", value: true }];
  if (channelIds) filter.push({ type: "equalsAny", field: "id", value: channelIds.length ? channelIds : ["-"] });
  const [result, menus] = await Promise.all([
    adminSearch<SalesChannelRow>(event, "sales-channel", {
      filter,
      includes: {
        sales_channel: ["id", "translated", "navigationCategoryId", "currencyId", "languageId"],
      },
    }),
    pluginMenuCategories(event),
  ]);
  const order = (id: string) => (listed.includes(id) ? listed.indexOf(id) : 0);
  return result.data
    .sort((a, b) => order(a.id) - order(b.id))
    .map((row) => ({
      id: row.id,
      name: row.translated.name,
      navigationCategoryId: row.navigationCategoryId,
      currencyId: row.currencyId,
      languageId: row.languageId,
      // NUXT_SALES_CHANNELS wins, then the plugin configuration, then the navigation category
      menuCategoryId:
        configured.find((c) => c.id === row.id)?.menuCategoryId ?? menus[row.id] ?? row.navigationCategoryId,
    }));
}

/** The channel picked in the header; menu, hours and settings are per channel. */
export async function currentSalesChannel(event: H3Event): Promise<SalesChannel> {
  const session = await useShopwareSession(event);
  const channels = await restaurantChannels(event);
  const channel = channels.find((c) => c.id === session.data.channelId) ?? channels[0];
  if (!channel) {
    throw createError({ statusCode: 500, statusMessage: "Kein Verkaufskanal gefunden" });
  }
  return channel;
}
