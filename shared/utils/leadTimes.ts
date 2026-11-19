import type { Fulfillment } from "#shared/types/backoffice";

// the usual steps as big buttons; pickup is ready sooner than a delivery
const STEPS: Record<Fulfillment, number[]> = {
  delivery: [20, 30, 45, 60, 90],
  pickup: [10, 15, 20, 30, 45],
};

/** The preset buttons for a shipping method; an unusual stored value stays selectable. */
export function leadTimeOptions(fulfillment: Fulfillment, current: number): number[] {
  return [...new Set([...STEPS[fulfillment], current])].sort((a, b) => a - b);
}

/** What the guest sees next to the shipping method in the storefront. */
export function leadTimeLabel(fulfillment: Fulfillment): string {
  return fulfillment === "pickup" ? "Abholzeit" : "Lieferzeit";
}
