import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);
const Uuid = z.string().regex(/^[0-9a-f]{32}$/);
const Text = (max: number) => z.string().trim().max(max);
const Name = z.string().trim().min(1).max(255);
const Measure = z.number().nonnegative().max(100000).nullable();

const Body = z.object({
  name: Name,
  description: Text(5000),
  onMenu: z.boolean(),
  price: z.number().positive("Bitte einen Preis eingeben").max(10000),
  sectionIds: z.array(Uuid).max(20),
  ingredients: z.array(Name).max(50),
  diet: z.enum(["vegan", "vegetarisch"]).nullable(),
  properties: z.array(z.object({ group: Name, options: z.array(Name).max(50) })).max(20),
  allergens: z.array(z.enum(ALLERGENS.map((a) => a.key) as [string, ...string[]])),
  additives: z.array(z.enum(ADDITIVES.map((a) => a.key) as [string, ...string[]])),
  allergensChecked: z.boolean(),
  tags: z.array(Name).max(50),
  searchKeywords: z.array(Name).max(50),
  dimensions: z.object({ width: Measure, height: Measure, length: Measure, weight: Measure }),
  upsell: z.boolean(),
  printType: z.enum(["number", "label"]),
  deliveryTimeFactor: z.number().int().min(1).max(10),
  seo: z.object({ title: Text(255), description: Text(255), keywords: Text(255) }),
  extras: z.array(z.object({ id: Uuid.nullable(), name: Name, productIds: z.array(Uuid).max(100) })).max(10),
  extraGroupIds: z.array(Uuid).max(10),
  variants: z
    .array(
      z.object({
        group: Name,
        options: z.array(z.object({ name: Name, surcharge: z.number().min(0).max(1000) })).max(20),
      }),
    )
    .max(3)
    .refine((groups) => groups.reduce((n, g) => n * Math.max(1, g.options.length), 1) <= 100, {
      message: "Zu viele Varianten (höchstens 100)",
    }),
});

export default defineEventHandler(async (event) => {
  const id = Id.parse(getRouterParam(event, "id"));
  const input = await readValidBody(event, Body);
  await saveDish(event, id, input);
  return loadDish(event, id);
});
