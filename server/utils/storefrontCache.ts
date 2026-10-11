import type { H3Event } from "h3";

/** Response header that tells the app a storefront still shows the old menu. */
export const STALE_HEADER = "x-storefront-stale";

/**
 * Empties the Store API cache of every storefront of this installation after a menu change
 * (storefront `POST /api/_cache/purge`, storefront#484), else guests see the change only
 * after a day. Without products and categories everything goes. A storefront that does not
 * answer never fails the save: the change is in Shopware, the response only carries
 * STALE_HEADER and the app shows a hint.
 */
export async function purgeStorefronts(event: H3Event, target: { products?: string[]; categories?: string[] } = {}) {
  const { storefrontUrls, cachePurgeSecret } = useRuntimeConfig(event);
  const urls = splitUrls(storefrontUrls);
  if (!urls.length || !cachePurgeSecret) return;
  const results = await Promise.allSettled(
    urls.map((url) =>
      $fetch(`${url}/api/_cache/purge`, {
        method: "POST",
        headers: { authorization: `Bearer ${cachePurgeSecret}` },
        body: target,
        timeout: 3000,
        retry: 1,
      }),
    ),
  );
  const failed = urls.filter((_, i) => results[i]?.status === "rejected");
  if (failed.length) {
    console.warn(`storefront cache purge failed: ${failed.join(", ")}`);
    setResponseHeader(event, STALE_HEADER, "1");
  }
}

export const splitUrls = (value: string) =>
  value
    .split(",")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);
