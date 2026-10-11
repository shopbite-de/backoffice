/** Shapes the backoffice API returns: gastro words, not Shopware entities. */

export type OrderStatus = "neu" | "in_arbeit" | "fertig" | "storniert";

export interface OrderLine {
  quantity: number;
  label: string;
  extras: string[];
}

export interface OrderSummary {
  id: string;
  number: string;
  channel: string;
  createdAt: string;
  status: OrderStatus;
  total: number;
  mode: "lieferung" | "abholung";
  customer: string;
  address: string | null;
  comment: string | null;
  lines: OrderLine[];
  /** "Jetzt drucken": requested and last printed (custom fields of the ShopBite plugin, ISO times) */
  printRequestedAt: string | null;
  printedAt: string | null;
}

export interface MenuDish {
  id: string;
  number: string;
  name: string;
  onMenu: boolean;
  price: number | null;
  allergensChecked: boolean;
}

export interface MenuSection {
  id: string;
  name: string;
  dishes: MenuDish[];
}

export interface OpeningInterval {
  dayOfWeek: number; // 1 = Montag … 7 = Sonntag (like the storefront)
  openingTime: string; // "HH:MM"
  closingTime: string;
}

export interface ShopSettings {
  orderingOpen: boolean;
  deliveryMinutes: number | null;
}

/** A dish with everything the restaurant edits; mapped onto Shopware in server/utils/dishes.ts. */
export interface DishDetail {
  id: string;
  number: string;
  name: string;
  description: string;
  onMenu: boolean;
  price: number;
  taxRate: number;
  sectionIds: string[];
  ingredients: string[]; // property group "Hauptzutaten"
  diet: "vegan" | "vegetarisch" | null; // groups "Vegan" / "Vegetarisch" with option "Ja"
  properties: { group: string; options: string[] }[]; // every other property group
  allergens: string[]; // keys of ALLERGENS, group "Allergene"
  additives: string[]; // keys of ADDITIVES, group "Zusatzstoffe"
  allergensChecked: boolean; // custom field shopbite_allergens_checked: the lists above are complete
  tags: string[];
  searchKeywords: string[];
  dimensions: { width: number | null; height: number | null; length: number | null; weight: number | null };
  upsell: boolean; // custom field shopbite_cart_upsell
  printType: "number" | "label"; // custom field shopbite_receipt_print_type
  deliveryTimeFactor: number; // custom field shopbite_delivery_time_factor
  seo: { title: string; description: string; keywords: string };
  extras: { id: string | null; name: string; productIds: string[] }[]; // cross-sellings "productList"
  variants: { group: string; options: { name: string; surcharge: number }[] }[];
}

export type DishInput = Omit<DishDetail, "id" | "number" | "taxRate">;

export interface DishFormOptions {
  sections: { id: string; name: string }[];
  ingredients: string[];
  propertyGroups: { name: string; options: string[] }[];
  extraCandidates: { id: string; number: string; name: string }[];
  tags: string[];
}

/** A menu section (Shopware category under the channel's menu category). */
export interface MenuSectionDetail {
  id: string;
  name: string;
  visible: boolean;
  dishCount: number;
  seo: { title: string; description: string; path: string; pathIsCustom: boolean };
}

/**
 * What a person may do in the backoffice, derived from their Shopware ACL
 * role (Shopware still checks every call). Two roles for now:
 * Management (everything) and Personal (orders and ordering settings).
 */
export type Capability = "orders" | "settings" | "menu" | "hours";

export type StaffRole = "management" | "personal";

/** A device the person can log in with by fingerprint or face (WebAuthn passkey). */
export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface PasskeyList {
  enabled: boolean;
  passkeys: Passkey[];
}
