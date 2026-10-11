import type { H3Event } from "h3";
import { createHash, randomUUID } from "node:crypto";
import type { DishDetail, DishFormOptions, DishInput } from "#shared/types/backoffice";
import type { FoodLabel } from "#shared/utils/labels";

/**
 * Translates between a dish (what the restaurant edits) and the Shopware
 * product model the storefront reads (see storefront/CLAUDE.md, "Product
 * data model"): ingredients and diet are property options, sizes are
 * variants with a surcharge, extras are "productList" cross-sellings.
 */

const INGREDIENTS = "Hauptzutaten";
const VEGAN = "Vegan";
const VEGETARIAN = "Vegetarisch";
const YES = "Ja";
const SPECIAL_GROUPS = [INGREDIENTS, VEGAN, VEGETARIAN, ALLERGEN_GROUP, ADDITIVE_GROUP];
const LABEL_GROUPS = [
  { group: ALLERGEN_GROUP, catalogue: ALLERGENS },
  { group: ADDITIVE_GROUP, catalogue: ADDITIVES },
];
const keysOf = (catalogue: FoodLabel[], names: string[] = []) =>
  catalogue.filter((l) => names.some((n) => n.toLowerCase() === l.name.toLowerCase())).map((l) => l.key);

const newId = () => randomUUID().replaceAll("-", "");
/** Stable id for a variant: same parent + same options = same child. */
const variantId = (parentId: string, optionIds: string[]) =>
  createHash("md5").update(`${parentId}:${[...optionIds].sort().join(",")}`).digest("hex");

interface Price {
  currencyId: string;
  gross: number;
  net: number;
  linked: boolean;
}

interface OptionRow {
  id: string;
  name: string;
  position?: number;
  customFields?: Record<string, unknown> | null;
  translated: { name: string };
  groupId: string;
  group?: GroupRow;
}

interface GroupRow {
  id: string;
  translated: { name: string };
  options?: OptionRow[];
}

interface ProductRow {
  id: string;
  productNumber: string;
  active: boolean;
  translated: {
    name: string;
    description: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    keywords: string | null;
    customSearchKeywords: string[] | null;
  };
  width: number | null;
  height: number | null;
  length: number | null;
  weight: number | null;
  customFields: Record<string, unknown> | null;
  categoryIds: string[] | null;
  price: Price[] | null;
  tax: { taxRate: number };
  properties: OptionRow[];
  tags: { id: string; name: string }[];
  configuratorSettings: { id: string; optionId: string; price: Price[] | null; option: OptionRow }[];
  crossSellings: {
    id: string;
    type: string;
    translated: { name: string };
    assignedProducts: { id: string; productId: string; position: number }[];
  }[];
  children: { id: string; productNumber: string; price: Price[] | null; optionIds: string[] | null }[];
}

const nameOf = (row: { translated: { name: string } }) => row.translated.name;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function loadProduct(event: H3Event, id: string) {
  const { data } = await adminSearch<ProductRow>(event, "product", {
    ids: [id],
    associations: {
      tax: {},
      properties: { associations: { group: {} } },
      tags: {},
      configuratorSettings: { associations: { option: { associations: { group: {} } } } },
      crossSellings: { associations: { assignedProducts: {} } },
      children: {},
    },
  });
  const product = data[0];
  if (!product) throw createError({ statusCode: 404, statusMessage: "Gericht nicht gefunden" });
  return product;
}

/** All sections of the channel's menu (any depth), for assignment. */
async function menuCategories(event: H3Event) {
  const channel = await currentSalesChannel(event);
  const { data } = await adminSearch<{ id: string; parentId: string; translated: { name: string } }>(
    event,
    "category",
    {
      filter: [{ type: "contains", field: "path", value: `|${channel.menuCategoryId}|` }],
      includes: { category: ["id", "parentId", "translated"] },
      limit: 500,
    },
  );
  return { channel, categories: data };
}

async function propertyGroups(event: H3Event) {
  const { data } = await adminSearch<GroupRow>(event, "property-group", {
    limit: 500,
    associations: { options: {} },
    includes: {
      property_group: ["id", "translated", "options"],
      property_group_option: ["id", "name", "translated", "groupId", "position", "customFields"],
    },
  });
  return data;
}

function grossOf(prices: Price[] | null, currencyId: string): number | null {
  return (prices?.find((p) => p.currencyId === currencyId) ?? prices?.[0])?.gross ?? null;
}

export async function loadDish(event: H3Event, id: string): Promise<DishDetail> {
  const [product, { channel, categories }] = await Promise.all([loadProduct(event, id), menuCategories(event)]);
  const base = grossOf(product.price, channel.currencyId) ?? 0;
  const menuIds = new Set(categories.map((c) => c.id));

  const byGroup = new Map<string, string[]>();
  for (const option of product.properties) {
    const group = option.group ? nameOf(option.group) : "?";
    byGroup.set(group, [...(byGroup.get(group) ?? []), nameOf(option)]);
  }

  // surcharges: from the configurator setting, else from the variant prices
  const variants = new Map<string, { name: string; surcharge: number }[]>();
  for (const setting of product.configuratorSettings) {
    const group = setting.option.group ? nameOf(setting.option.group) : "?";
    let surcharge = grossOf(setting.price, channel.currencyId);
    if (surcharge === null) {
      const prices = product.children
        .filter((c) => c.optionIds?.includes(setting.optionId))
        .map((c) => grossOf(c.price, channel.currencyId) ?? base);
      surcharge = prices.length ? Math.max(0, Math.min(...prices) - base) : 0;
    }
    variants.set(group, [...(variants.get(group) ?? []), { name: nameOf(setting.option), surcharge: round2(surcharge) }]);
  }
  for (const options of variants.values()) options.sort((a, b) => a.surcharge - b.surcharge);

  const custom = product.customFields ?? {};
  return {
    id: product.id,
    number: product.productNumber,
    name: product.translated.name,
    description: product.translated.description ?? "",
    onMenu: product.active,
    price: base,
    taxRate: product.tax.taxRate,
    sectionIds: (product.categoryIds ?? []).filter((c) => menuIds.has(c)),
    ingredients: byGroup.get(INGREDIENTS) ?? [],
    allergens: keysOf(ALLERGENS, byGroup.get(ALLERGEN_GROUP)),
    additives: keysOf(ADDITIVES, byGroup.get(ADDITIVE_GROUP)),
    allergensChecked: product.customFields?.shopbite_allergens_checked === true,
    diet: byGroup.get(VEGAN)?.includes(YES) ? "vegan" : byGroup.get(VEGETARIAN)?.includes(YES) ? "vegetarisch" : null,
    properties: [...byGroup]
      .filter(([group]) => !SPECIAL_GROUPS.includes(group))
      .map(([group, options]) => ({ group, options })),
    tags: product.tags.map((t) => t.name),
    searchKeywords: product.translated.customSearchKeywords ?? [],
    dimensions: { width: product.width, height: product.height, length: product.length, weight: product.weight },
    upsell: custom.shopbite_cart_upsell === true,
    printType: custom.shopbite_receipt_print_type === "label" ? "label" : "number",
    deliveryTimeFactor: Number(custom.shopbite_delivery_time_factor ?? 1) || 1,
    seo: {
      title: product.translated.metaTitle ?? "",
      description: product.translated.metaDescription ?? "",
      keywords: product.translated.keywords ?? "",
    },
    extras: product.crossSellings
      .filter((c) => c.type === "productList")
      .map((c) => ({
        id: c.id,
        name: nameOf(c),
        productIds: [...c.assignedProducts].sort((a, b) => a.position - b.position).map((a) => a.productId),
      })),
    variants: [...variants].map(([group, options]) => ({ group, options })),
  };
}

export async function dishFormOptions(event: H3Event): Promise<DishFormOptions> {
  const [{ categories, channel }, groups, extras, tags] = await Promise.all([
    menuCategories(event),
    propertyGroups(event),
    // extras are products without a category (see the storefront data model)
    adminSearch<{ id: string; productNumber: string; translated: { name: string } }>(event, "product", {
      limit: 500,
      filter: [
        { type: "equals", field: "parentId", value: null },
        { type: "equals", field: "categoryIds", value: null },
      ],
      sort: [{ field: "productNumber", order: "ASC", naturalSorting: true }],
      includes: { product: ["id", "productNumber", "translated"] },
    }),
    adminSearch<{ name: string }>(event, "tag", { limit: 500, includes: { tag: ["name"] } }),
  ]);
  const options = (group: string) =>
    (groups.find((g) => nameOf(g) === group)?.options ?? []).map(nameOf).sort((a, b) => a.localeCompare(b, "de"));
  return {
    sections: categories
      .filter((c) => c.parentId === channel.menuCategoryId)
      .map((c) => ({ id: c.id, name: nameOf(c) })),
    ingredients: options(INGREDIENTS),
    propertyGroups: groups
      .map((g) => ({ name: nameOf(g), options: options(nameOf(g)) }))
      .filter((g) => !SPECIAL_GROUPS.includes(g.name)),
    extraCandidates: extras.data.map((p) => ({ id: p.id, number: p.productNumber, name: nameOf(p) })),
    tags: tags.data.map((t) => t.name).sort((a, b) => a.localeCompare(b, "de")),
  };
}

type Operation = { key: string; action: "upsert" | "delete"; entity: string; payload: Record<string, unknown>[] };

/**
 * Writes the whole dish in ONE sync request: Shopware runs it as one
 * transaction, so the shop never shows a half-saved dish. Mapping rows that
 * the form removed are deleted explicitly (an upsert only adds).
 */
export async function saveDish(event: H3Event, id: string, input: DishInput) {
  const [product, { channel, categories }, groups] = await Promise.all([
    loadProduct(event, id),
    menuCategories(event),
    propertyGroups(event),
  ]);
  const menuIds = new Set(categories.map((c) => c.id));
  for (const sectionId of input.sectionIds) {
    if (!menuIds.has(sectionId)) throw createError({ statusCode: 400, statusMessage: "Unbekannter Abschnitt" });
  }

  // --- property options by name, creating missing groups and options
  const newGroups = new Map<string, { id: string; name: string; options: Record<string, unknown>[] }>();
  const groupByName = new Map(groups.map((g) => [nameOf(g).toLowerCase(), g]));
  function optionId(groupName: string, optionName: string, extra: Record<string, unknown> = {}): string {
    const group = groupByName.get(groupName.toLowerCase());
    const existing = group?.options?.find((o) => nameOf(o).toLowerCase() === optionName.toLowerCase());
    if (existing) return existing.id;
    const pending = newGroups.get(groupName.toLowerCase()) ?? {
      id: group?.id ?? newId(),
      name: groupName,
      options: [],
    };
    newGroups.set(groupName.toLowerCase(), pending);
    const queued = pending.options.find((o) => String(o.name).toLowerCase() === optionName.toLowerCase());
    if (queued) return String(queued.id);
    const option = { id: newId(), name: optionName, ...extra };
    pending.options.push(option);
    return option.id;
  }

  const wantedProperties = new Set<string>([
    ...input.ingredients.map((i) => optionId(INGREDIENTS, i)),
    ...(input.diet === "vegan" ? [optionId(VEGAN, YES)] : []),
    ...(input.diet === "vegetarisch" ? [optionId(VEGETARIAN, YES)] : []),
    ...input.properties.flatMap((p) => p.options.map((o) => optionId(p.group, o))),
    ...LABEL_GROUPS.flatMap(({ group, catalogue }) => {
      const wanted = group === ALLERGEN_GROUP ? input.allergens : input.additives;
      return catalogue
        .filter((label) => wanted.includes(label.key))
        .map((label) =>
          optionId(group, label.name, {
            position: catalogue.indexOf(label) + 1,
            customFields: { shopbite_code: label.code },
          }),
        );
    }),
    // options of these groups that are not in the catalogue stay untouched
    ...product.properties
      .filter((o) => {
        const group = o.group ? nameOf(o.group) : "";
        const entry = LABEL_GROUPS.find((g) => g.group === group);
        return entry && !keysOf(entry.catalogue, [nameOf(o)]).length;
      })
      .map((o) => o.id),
  ]);

  // --- variants: every combination of the option groups
  const variantGroups = input.variants
    .filter((g) => g.options.length)
    .map((g) => g.options.map((o) => ({ id: optionId(g.group, o.name), name: o.name, surcharge: o.surcharge })));
  const combos = variantGroups.length
    ? variantGroups.reduce<(typeof variantGroups)[number][]>(
        (acc, group) => acc.flatMap((combo) => group.map((option) => [...combo, option])),
        [[]],
      )
    : [];

  const gross = round2(input.price);
  const priceFor = (amount: number): Price[] => [
    { currencyId: channel.currencyId, gross: round2(amount), net: round2(amount) / (1 + product.tax.taxRate / 100), linked: true },
  ];

  // --- tags by name
  const { data: knownTags } = input.tags.length
    ? await adminSearch<{ id: string; name: string }>(event, "tag", {
        filter: [{ type: "equalsAny", field: "name", value: input.tags }],
        includes: { tag: ["id", "name"] },
      })
    : { data: [] };
  const newTags = input.tags
    .filter((t) => !knownTags.some((k) => k.name === t))
    .map((name) => ({ id: newId(), name }));
  const wantedTags = new Set([...knownTags.filter((k) => input.tags.includes(k.name)), ...newTags].map((t) => t.id));

  const ops: Operation[] = [];
  const push = (key: string, action: Operation["action"], entity: string, payload: Record<string, unknown>[]) => {
    if (payload.length) ops.push({ key, action, entity, payload });
  };

  push("groups", "upsert", "property_group", [...newGroups.values()].map((g) => ({
    id: g.id,
    ...(groupByName.has(g.name.toLowerCase())
      ? {}
      : { name: g.name, displayType: "text", sortingType: "position", filterable: false, visibleOnProductDetailPage: true }),
    options: g.options,
  })));
  push("tags", "upsert", "tag", newTags);
  // catalogue options created elsewhere (Shopware Admin, import) get code and position
  push("label-options", "upsert", "property_group_option", LABEL_GROUPS.flatMap(({ group, catalogue }) =>
    (groupByName.get(group.toLowerCase())?.options ?? []).flatMap((option) => {
      const label = catalogue.find((l) => l.name.toLowerCase() === nameOf(option).toLowerCase());
      const position = label ? catalogue.indexOf(label) + 1 : 0;
      return label && (option.customFields?.shopbite_code !== label.code || option.position !== position)
        ? [{ id: option.id, position, customFields: { ...(option.customFields ?? {}), shopbite_code: label.code } }]
        : [];
    })));

  // removed mappings
  push("drop-properties", "delete", "product_property", product.properties
    .filter((o) => !wantedProperties.has(o.id))
    .map((o) => ({ productId: id, optionId: o.id })));
  push("drop-sections", "delete", "product_category", (product.categoryIds ?? [])
    .filter((c) => menuIds.has(c) && !input.sectionIds.includes(c))
    .map((categoryId) => ({ productId: id, categoryId })));
  push("drop-tags", "delete", "product_tag", product.tags
    .filter((t) => !wantedTags.has(t.id))
    .map((t) => ({ productId: id, tagId: t.id })));

  const wantedOptionIds = new Set(variantGroups.flat().map((o) => o.id));
  push("drop-settings", "delete", "product_configurator_setting", product.configuratorSettings
    .filter((s) => !wantedOptionIds.has(s.optionId))
    .map((s) => ({ id: s.id })));
  const wantedChildren = new Set(combos.map((combo) => variantId(id, combo.map((o) => o.id))));
  const childByOptions = new Map(product.children.map((c) => [variantId(id, c.optionIds ?? []), c]));
  push("drop-variants", "delete", "product", product.children
    .filter((c) => !wantedChildren.has(variantId(id, c.optionIds ?? [])))
    .map((c) => ({ id: c.id })));

  const keptCrossSellings = new Set(input.extras.map((e) => e.id).filter(Boolean));
  push("drop-extras", "delete", "product_cross_selling", product.crossSellings
    .filter((c) => c.type === "productList" && !keptCrossSellings.has(c.id))
    .map((c) => ({ id: c.id })));
  push("drop-extra-items", "delete", "product_cross_selling_assigned_products", product.crossSellings
    .filter((c) => keptCrossSellings.has(c.id))
    .flatMap((c) => {
      const wanted = input.extras.find((e) => e.id === c.id)?.productIds ?? [];
      return c.assignedProducts.filter((a) => !wanted.includes(a.productId)).map((a) => ({ id: a.id }));
    }));

  // the dish itself
  const settingByOption = new Map(product.configuratorSettings.map((s) => [s.optionId, s.id]));
  const assignedId = (crossSellingId: string | null, productId: string) =>
    product.crossSellings.find((c) => c.id === crossSellingId)?.assignedProducts.find((a) => a.productId === productId)?.id ?? newId();
  push("dish", "upsert", "product", [{
    id,
    name: input.name,
    description: input.description,
    active: input.onMenu,
    price: [...priceFor(gross), ...(product.price ?? []).filter((p) => p.currencyId !== channel.currencyId)],
    metaTitle: input.seo.title || null,
    metaDescription: input.seo.description || null,
    keywords: input.seo.keywords || null,
    customSearchKeywords: input.searchKeywords,
    width: input.dimensions.width,
    height: input.dimensions.height,
    length: input.dimensions.length,
    weight: input.dimensions.weight,
    // merged with the stored fields, so fields the backoffice does not know survive
    customFields: {
      ...(product.customFields ?? {}),
      shopbite_cart_upsell: input.upsell,
      shopbite_receipt_print_type: input.printType,
      shopbite_delivery_time_factor: input.deliveryTimeFactor,
      shopbite_allergens_checked: input.allergensChecked,
    },
    categories: input.sectionIds.map((categoryId) => ({ id: categoryId })),
    properties: [...wantedProperties].map((optionId) => ({ id: optionId })),
    tags: [...wantedTags].map((tagId) => ({ id: tagId })),
    configuratorSettings: variantGroups.flat().map((o) => ({
      id: settingByOption.get(o.id) ?? newId(),
      optionId: o.id,
      price: o.surcharge ? priceFor(o.surcharge) : null,
    })),
    ...(combos.length ? { variantListingConfig: { displayParent: true } } : {}),
    crossSellings: input.extras.map((extra, position) => ({
      id: extra.id ?? newId(),
      name: extra.name,
      type: "productList",
      active: true,
      position,
      sortBy: "name",
      sortDirection: "ASC",
      limit: 24,
      assignedProducts: extra.productIds.map((productId, i) => ({
        id: assignedId(extra.id, productId),
        productId,
        position: i,
      })),
    })),
  }]);

  const usedNumbers = new Set(product.children.map((c) => c.productNumber));
  push("variants", "upsert", "product", combos.map((combo) => {
    const optionIds = combo.map((o) => o.id);
    const existing = childByOptions.get(variantId(id, optionIds));
    const surcharge = combo.reduce((sum, o) => sum + o.surcharge, 0);
    let number = existing?.productNumber;
    if (!number) {
      const slug = combo.map((o) => o.name.split(/\s+/)[0]!.toLowerCase()).join("-");
      number = `${product.productNumber}-${slug}`;
      for (let i = 2; usedNumbers.has(number); i++) number = `${product.productNumber}-${slug}-${i}`;
      usedNumbers.add(number);
    }
    return {
      id: existing?.id ?? variantId(id, optionIds),
      parentId: id,
      productNumber: number,
      ...(existing ? {} : { stock: 999, active: true }),
      options: optionIds.map((optionId) => ({ id: optionId })),
      // no surcharge = inherits the dish price
      price: surcharge ? priceFor(gross + surcharge) : null,
    };
  }));

  await adminApi(event, "/_action/sync", { method: "POST", body: ops });
}
