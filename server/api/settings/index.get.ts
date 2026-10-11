import type { ShopSettings } from "#shared/types/backoffice";

/** Read through the plugin's settings route (shopware-plugin#34): own privilege, channel value with global fallback. */
export default defineEventHandler(async (event): Promise<ShopSettings> => {
  const channel = await currentSalesChannel(event);
  return adminApi<ShopSettings>(event, `/_action/shopbite/settings/${channel.id}`);
});
