import type { ShopSettings } from "#shared/types/backoffice";

/**
 * Read through the plugin's settings route (shopware-plugin#34): own privilege, ordering switch per
 * channel with global fallback, and the lead time of every shipping method of the channel.
 */
export default defineEventHandler(async (event): Promise<ShopSettings> => {
  const channel = await currentSalesChannel(event);
  return toShopSettings(await adminApi<ShopSettings>(event, `/_action/shopbite/settings/${channel.id}`));
});
