import type { ShopSettings } from "#shared/types/backoffice";

/** Only the fields the backoffice knows reach the browser (plugin route `/_action/shopbite/settings/{salesChannelId}`). */
export function toShopSettings({ orderingOpen, shippingMethods }: ShopSettings): ShopSettings {
  return {
    orderingOpen,
    shippingMethods: shippingMethods.map(
      ({ id, name, fulfillment, leadTimeMinutes, leadTimeMinutesSet, editable }) => ({
        id,
        name,
        fulfillment,
        leadTimeMinutes,
        leadTimeMinutesSet,
        editable,
      }),
    ),
  };
}
