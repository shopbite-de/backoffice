import { beforeEach, describe, expect, it, vi } from "vitest";

/* Emptying the storefront caches after a save must never fail the save. */
let config = { storefrontUrls: "", cachePurgeSecret: "" };
const calls: { url: string; options: { headers: Record<string, string>; body: unknown } }[] = [];
let headers: Record<string, string> = {};
vi.stubGlobal("useRuntimeConfig", () => config);
vi.stubGlobal("setResponseHeader", (_event: unknown, name: string, value: string) => (headers[name] = value));
vi.stubGlobal("$fetch", async (url: string, options: (typeof calls)[number]["options"]) => {
  calls.push({ url, options });
  if (url.includes("down")) throw new Error("ECONNREFUSED");
  return { purged: 1 };
});
vi.spyOn(console, "warn").mockImplementation(() => {});

const { purgeStorefronts, splitUrls, STALE_HEADER } = await import("../server/utils/storefrontCache");
const event = {} as never;

beforeEach(() => {
  calls.length = 0;
  headers = {};
});

describe("purgeStorefronts", () => {
  it("does nothing without storefronts or secret", async () => {
    config = { storefrontUrls: "https://shop.de", cachePurgeSecret: "" };
    await purgeStorefronts(event, { products: ["p"] });
    expect(calls).toEqual([]);
  });

  it("asks every storefront with the secret and the target", async () => {
    config = { storefrontUrls: "https://a.de/, https://b.de", cachePurgeSecret: "s3cret" };
    await purgeStorefronts(event, { products: ["p"] });
    expect(calls.map((c) => c.url)).toEqual(["https://a.de/api/_cache/purge", "https://b.de/api/_cache/purge"]);
    expect(calls[0]!.options.headers.authorization).toBe("Bearer s3cret");
    expect(calls[0]!.options.body).toEqual({ products: ["p"] });
    expect(headers).toEqual({});
  });

  it("marks the response when a storefront does not answer", async () => {
    config = { storefrontUrls: "https://a.de,https://down.de", cachePurgeSecret: "s3cret" };
    await expect(purgeStorefronts(event)).resolves.toBeUndefined();
    expect(headers[STALE_HEADER]).toBe("1");
  });
});

it("splitUrls trims and drops empty entries and trailing slashes", () => {
  expect(splitUrls(" https://a.de/ ,,https://b.de// ")).toEqual(["https://a.de", "https://b.de"]);
});
