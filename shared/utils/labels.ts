/**
 * Fixed catalogue for the mandatory food information of a dish: the 14
 * allergens of the LMIV (Annex II, cereals and nuts by name) and the
 * additives German menus have to mark. Stored in Shopware as the property
 * groups "Allergene" and "Zusatzstoffe"; the option name is what guests
 * read, `code` goes into the option's custom field `shopbite_code`.
 */
export interface FoodLabel {
  key: string;
  code: string;
  name: string;
  /** heading the option is listed under (cereals, nuts) */
  kind?: string;
}

export const ALLERGEN_GROUP = "Allergene";
export const ADDITIVE_GROUP = "Zusatzstoffe";

const GLUTEN = "Glutenhaltiges Getreide";
const NUTS = "Schalenfrüchte";

export const ALLERGENS: FoodLabel[] = [
  { key: "weizen", code: "A", name: "Weizen", kind: GLUTEN },
  { key: "roggen", code: "A", name: "Roggen", kind: GLUTEN },
  { key: "gerste", code: "A", name: "Gerste", kind: GLUTEN },
  { key: "hafer", code: "A", name: "Hafer", kind: GLUTEN },
  { key: "dinkel", code: "A", name: "Dinkel", kind: GLUTEN },
  { key: "kamut", code: "A", name: "Kamut", kind: GLUTEN },
  { key: "krebstiere", code: "B", name: "Krebstiere" },
  { key: "eier", code: "C", name: "Eier" },
  { key: "fisch", code: "D", name: "Fisch" },
  { key: "erdnuesse", code: "E", name: "Erdnüsse" },
  { key: "soja", code: "F", name: "Soja" },
  { key: "milch", code: "G", name: "Milch (inkl. Laktose)" },
  { key: "mandeln", code: "H", name: "Mandeln", kind: NUTS },
  { key: "haselnuesse", code: "H", name: "Haselnüsse", kind: NUTS },
  { key: "walnuesse", code: "H", name: "Walnüsse", kind: NUTS },
  { key: "cashew", code: "H", name: "Cashewnüsse", kind: NUTS },
  { key: "pekan", code: "H", name: "Pekannüsse", kind: NUTS },
  { key: "paranuesse", code: "H", name: "Paranüsse", kind: NUTS },
  { key: "pistazien", code: "H", name: "Pistazien", kind: NUTS },
  { key: "macadamia", code: "H", name: "Macadamianüsse", kind: NUTS },
  { key: "sellerie", code: "L", name: "Sellerie" },
  { key: "senf", code: "M", name: "Senf" },
  { key: "sesam", code: "N", name: "Sesam" },
  { key: "sulfite", code: "O", name: "Schwefeldioxid und Sulfite" },
  { key: "lupinen", code: "P", name: "Lupinen" },
  { key: "weichtiere", code: "R", name: "Weichtiere" },
];

export const ADDITIVES: FoodLabel[] = [
  { key: "farbstoff", code: "1", name: "mit Farbstoff" },
  { key: "konservierung", code: "2", name: "mit Konservierungsstoff" },
  { key: "antioxidation", code: "3", name: "mit Antioxidationsmittel" },
  { key: "geschmacksverstaerker", code: "4", name: "mit Geschmacksverstärker" },
  { key: "geschwefelt", code: "5", name: "geschwefelt" },
  { key: "geschwaerzt", code: "6", name: "geschwärzt" },
  { key: "gewachst", code: "7", name: "gewachst" },
  { key: "phosphat", code: "8", name: "mit Phosphat" },
  { key: "suessungsmittel", code: "9", name: "mit Süßungsmittel" },
  { key: "phenylalanin", code: "10", name: "enthält eine Phenylalaninquelle" },
  { key: "koffein", code: "11", name: "koffeinhaltig" },
  { key: "chinin", code: "12", name: "chininhaltig" },
];
