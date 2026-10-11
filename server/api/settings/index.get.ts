import type { ShopSettings } from "#shared/types/backoffice";

const PREFIX = "ShopBitePlugin.config.";

type Config = Record<string, unknown>;

export default defineEventHandler(async (event): Promise<ShopSettings> => {
  const channel = await currentSalesChannel(event);
  // the channel value wins, the global value is the fallback (like SystemConfigService)
  const [global, own] = await Promise.all([
    adminApi<Config>(event, "/_action/system-config", {
      query: { domain: "ShopBitePlugin.config" },
    }),
    adminApi<Config>(event, "/_action/system-config", {
      query: { domain: "ShopBitePlugin.config", salesChannelId: channel.id },
    }),
  ]);
  const value = (name: string) => own[PREFIX + name] ?? global[PREFIX + name];
  const minutes = Number(value("defaultDeliveryTime"));
  return {
    orderingOpen: value("isCheckoutEnabled") !== false,
    deliveryMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
  };
});
