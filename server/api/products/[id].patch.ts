import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);
const Body = z
  .object({
    onMenu: z.boolean().optional(),
    price: z.number().positive().max(10000).optional(),
  })
  .refine((b) => b.onMenu !== undefined || b.price !== undefined);

interface Product {
  id: string;
  tax: { taxRate: number };
  price: { currencyId: string; gross: number; net: number; linked: boolean }[];
}

/**
 * A restaurant thinks in gross prices. Shopware stores gross and net per
 * currency, so the net price is derived from the product's tax rate.
 */
export default defineEventHandler(async (event) => {
  const id = Id.parse(getRouterParam(event, "id"));
  const body = await readValidBody(event, Body);
  const payload: Record<string, unknown> = {};

  if (body.onMenu !== undefined) payload.active = body.onMenu;

  if (body.price !== undefined) {
    const channel = await currentSalesChannel(event);
    const { data } = await adminSearch<Product>(event, "product", {
      ids: [id],
      associations: { tax: {} },
      includes: { product: ["id", "tax", "price"], tax: ["taxRate"] },
    });
    const product = data[0];
    if (!product) throw createError({ statusCode: 404 });
    const gross = Math.round(body.price * 100) / 100;
    // Shopware keeps net prices with four decimals
    const net = Math.round((gross / (1 + product.tax.taxRate / 100)) * 10000) / 10000;
    const others = (product.price ?? []).filter(
      (p) => p.currencyId !== channel.currencyId,
    );
    payload.price = [
      { currencyId: channel.currencyId, gross, net, linked: true },
      ...others,
    ];
  }

  await adminApi(event, `/product/${id}`, { method: "PATCH", body: payload });
  return { ok: true };
});
