import { FetchError } from "ofetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Request hardening: same-origin writes, JSON bodies, client IP, session secret, error texts. */
type Headers = Record<string, string | undefined>;
let headers: Headers = {};
let rawBody: string | undefined;
let config: Record<string, unknown> = {};
let sessionOptions: Record<string, unknown> | undefined;

class HttpError extends Error {
  constructor(
    public statusCode: number,
    public statusMessage: string,
  ) {
    super(statusMessage);
  }
}
vi.stubGlobal(
  "createError",
  (e: { statusCode: number; statusMessage: string }) => new HttpError(e.statusCode, e.statusMessage),
);
vi.stubGlobal("getRequestHeader", (_event: unknown, name: string) => headers[name.toLowerCase()]);
vi.stubGlobal("readRawBody", async () => rawBody);
vi.stubGlobal("useRuntimeConfig", () => config);
vi.stubGlobal("useSession", (_event: unknown, options: Record<string, unknown>) => {
  sessionOptions = options;
  return { data: {} };
});
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

const { isSameOriginWrite } = await import("../server/utils/requestGuard");
const { clientIpFrom } = await import("../server/utils/loginLimit");
const { sessionPasswordProblem } = await import("../server/utils/sessionPassword");
vi.stubGlobal("sessionPasswordProblem", sessionPasswordProblem);
const { readValidBody } = await import("../server/utils/validate");
const { toH3Error } = await import("../server/utils/adminApi");
const { useShopwareSession } = await import("../server/utils/session");
const { z } = await import("zod");

const event = {} as never;
const STRONG = "q8Vn2Lr0XwZ5tJ7bK1pM9sD3fH6yC4gA";

beforeEach(() => {
  headers = {};
  rawBody = undefined;
  config = {};
  warn.mockClear();
});

describe("isSameOriginWrite", () => {
  const base = { host: "backoffice.mein-restaurant.de", allowedOrigins: [] as string[] };

  it("lets reads through without any header", () => {
    expect(isSameOriginWrite({ ...base, method: "GET" })).toBe(true);
    expect(isSameOriginWrite({ ...base, method: "HEAD" })).toBe(true);
  });

  it("accepts a write whose Origin is the own host", () => {
    expect(isSameOriginWrite({ ...base, method: "POST", origin: "https://backoffice.mein-restaurant.de" })).toBe(true);
  });

  it("rejects a write from another site", () => {
    expect(isSameOriginWrite({ ...base, method: "POST", origin: "https://evil.example" })).toBe(false);
    expect(isSameOriginWrite({ ...base, method: "PUT", origin: "https://mein-restaurant.de" })).toBe(false);
  });

  it("rejects a write without Origin and Sec-Fetch-Site", () => {
    expect(isSameOriginWrite({ ...base, method: "DELETE" })).toBe(false);
    expect(isSameOriginWrite({ ...base, method: "POST", origin: "null" })).toBe(false);
  });

  it("accepts Sec-Fetch-Site same-origin, but not same-site or cross-site", () => {
    expect(isSameOriginWrite({ ...base, method: "PATCH", secFetchSite: "same-origin" })).toBe(true);
    expect(isSameOriginWrite({ ...base, method: "PATCH", secFetchSite: "same-site" })).toBe(false);
    expect(
      isSameOriginWrite({ ...base, method: "PATCH", secFetchSite: "cross-site", origin: "https://evil.example" }),
    ).toBe(false);
  });

  it("checks against the configured origins instead of the Host header when set", () => {
    const allowedOrigins = ["https://backoffice.mein-restaurant.de"];
    const write = { method: "POST", host: "internal:3000", allowedOrigins };
    expect(isSameOriginWrite({ ...write, origin: "https://backoffice.mein-restaurant.de" })).toBe(true);
    expect(isSameOriginWrite({ ...write, origin: "http://internal:3000" })).toBe(false);
    expect(isSameOriginWrite({ ...write, origin: "http://backoffice.mein-restaurant.de" })).toBe(false);
  });
});

describe("clientIpFrom", () => {
  it("takes the entry the trusted proxy appended, not the one the client sent", () => {
    expect(clientIpFrom("6.6.6.6, 203.0.113.7", "10.0.0.2", 1)).toBe("203.0.113.7");
    expect(clientIpFrom("1.1.1.1, 2.2.2.2, 203.0.113.7", "10.0.0.2", 1)).toBe("203.0.113.7");
  });

  it("counts several trusted proxies from the right", () => {
    expect(clientIpFrom("6.6.6.6, 203.0.113.7, 10.0.0.9", "10.0.0.2", 2)).toBe("203.0.113.7");
  });

  it("uses the socket address without proxies or without the header", () => {
    expect(clientIpFrom("6.6.6.6", "10.0.0.2", 0)).toBe("10.0.0.2");
    expect(clientIpFrom(undefined, "10.0.0.2", 1)).toBe("10.0.0.2");
  });

  it("uses the leftmost entry when the header has fewer entries than proxies", () => {
    expect(clientIpFrom("203.0.113.7", "10.0.0.2", 2)).toBe("203.0.113.7");
  });
});

describe("sessionPasswordProblem", () => {
  it("accepts a random secret of 32 characters", () => {
    expect(sessionPasswordProblem(STRONG)).toBeNull();
  });

  it("keeps the minimum length", () => {
    expect(sessionPasswordProblem("q8Vn2Lr0XwZ5tJ7b")).toMatch(/32/);
  });

  it("refuses the example value and obviously weak ones", () => {
    expect(sessionPasswordProblem("change-me-to-a-random-string-of-32-chars")).not.toBeNull();
    expect(sessionPasswordProblem("a".repeat(40))).not.toBeNull();
    expect(sessionPasswordProblem("0123456789abcdef".repeat(2))).not.toBeNull();
    expect(sessionPasswordProblem("abababababababababababababababab12")).not.toBeNull();
  });
});

describe("readValidBody", () => {
  const Body = z.object({ name: z.string() });

  it("parses a JSON body", async () => {
    headers["content-type"] = "application/json; charset=utf-8";
    rawBody = '{"name":"Pizza"}';
    await expect(readValidBody(event, Body)).resolves.toEqual({ name: "Pizza" });
  });

  it("refuses a body that is not declared as JSON", async () => {
    headers["content-type"] = "text/plain";
    rawBody = '{"name":"Pizza"}';
    await expect(readValidBody(event, Body)).rejects.toMatchObject({ statusCode: 415 });
    headers["content-type"] = undefined;
    await expect(readValidBody(event, Body)).rejects.toMatchObject({ statusCode: 415 });
  });
});

describe("toH3Error", () => {
  const shopwareError = (statusCode: number, detail: string) =>
    Object.assign(new FetchError("failed"), { statusCode, data: { errors: [{ detail }] } });

  it("never shows Shopware's detail to the browser, only in the server log", () => {
    const error = toH3Error(shopwareError(400, "SQLSTATE[23000]: Integrity constraint violation")) as HttpError;
    expect(error.statusCode).toBe(400);
    expect(error.statusMessage).not.toMatch(/SQLSTATE/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("400"), expect.stringContaining("SQLSTATE"));
  });

  it("keeps the readable text for a missing privilege", () => {
    const error = toH3Error(shopwareError(403, "Missing privilege product:update")) as HttpError;
    expect(error.statusMessage).toBe("Dafür fehlt dieser Anmeldung die Berechtigung");
  });
});

describe("useShopwareSession", () => {
  it("reads the session from the cookie only", async () => {
    config = { session: { password: STRONG } };
    await useShopwareSession(event);
    expect(sessionOptions?.sessionHeader).toBe(false);
  });

  it("refuses a weak session secret", () => {
    config = { session: { password: "change-me-to-a-random-string-of-32-chars" } };
    expect(() => useShopwareSession(event)).toThrow(/placeholder/);
  });
});

describe("security headers", () => {
  it("are set for every route", async () => {
    vi.stubGlobal("defineNuxtConfig", (c: unknown) => c);
    const { default: nuxtConfig } = await import("../nuxt.config");
    const rule = (nuxtConfig as { routeRules: Record<string, { headers: Record<string, string> }> }).routeRules["/**"];
    expect(rule?.headers).toMatchObject({
      "Strict-Transport-Security": expect.stringContaining("max-age="),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": expect.stringContaining("frame-ancestors 'none'"),
      "Referrer-Policy": expect.any(String),
    });
  });
});
