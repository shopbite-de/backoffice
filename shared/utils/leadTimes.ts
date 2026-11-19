import type { Fulfillment, ShippingMethodLeadTime } from "#shared/types/backoffice";

// the usual steps as big buttons; pickup is ready sooner than a delivery
const STEPS: Record<Fulfillment, number[]> = {
  delivery: [20, 30, 45, 60, 90],
  pickup: [10, 15, 20, 30, 45],
};

/** The preset buttons for a shipping method; an unusual stored value stays selectable. */
export function leadTimeOptions(fulfillment: Fulfillment, current: number): number[] {
  return [...new Set([...STEPS[fulfillment], current])].sort((a, b) => a - b);
}

/** Why a person cannot change a lead time (the plugin refuses it with 403). */
export const SHARED_METHOD_HINT =
  "Diese Versandart nutzen auch andere Filialen. Ändern kann die Zeit nur, wer für alle diese Filialen zuständig ist.";

/** A button shows as chosen only for a value the restaurant set; an unset method shows the default as such. */
export function isChosen(
  method: Pick<ShippingMethodLeadTime, "leadTimeMinutes" | "leadTimeMinutesSet">,
  minutes: number,
): boolean {
  return method.leadTimeMinutesSet && minutes === method.leadTimeMinutes;
}

/** What the guest sees next to the shipping method in the storefront. */
export function leadTimeLabel(fulfillment: Fulfillment): string {
  return fulfillment === "pickup" ? "Abholzeit" : "Lieferzeit";
}
