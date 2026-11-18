import { beforeEach, describe, expect, it, vi } from "vitest";
import { FetchError } from "ofetch";
import type { BackofficeSession } from "../server/utils/session";

/*
 * Adding a passkey needs a Shopware token with the scope "user-verified", which only a fresh
 * password login gives. That token is used for this one registration and never replaces the
 * session's own tokens.
 */
type Call = {
  url: string;
  options: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> };
};
const calls: Call[] = [];
let answer: (call: Call) => unknown;
let data: BackofficeSession;
let now = 1_000_000;

const fetchError = (statusCode: number, body: unknown) =>
  Object.assign(new FetchError("Shopware"), { statusCode, status: statusCode, data: body });

vi.stubGlobal("useRuntimeConfig", () => ({ shopwareUrl: "https://shop.test/", trustedProxies: 0 }));
vi.stubGlobal("createError", (input: { statusCode: number; statusMessage: string; data?: unknown }) =>
  Object.assign(new Error(input.statusMessage), input),
);
vi.stubGlobal("getRequestIP", () => "10.0.0.1");
vi.stubGlobal("getRequestHeader", () => undefined);
vi.stubGlobal("setResponseHeader", () => {});
vi.stubGlobal("$fetch", async (url: string, options: Call["options"]) => {
  const call = { url, options };
  calls.push(call);
  return answer(call);
});
vi.stubGlobal("useShopwareSession", async () => ({
  get data() {
    return data;
  },
  update: async (update: Partial<BackofficeSession>) => {
    data = { ...data, ...update };
  },
}));
vi.spyOn(Date, "now").mockImplementation(() => now);
vi.spyOn(console, "warn").mockImplementation(() => {});

const limit = await import("../server/utils/loginLimit");
for (const name of ["loginKeys", "assertLoginAllowed", "loginFailed", "loginSucceeded"] as const) {
  vi.stubGlobal(name, limit[name]);
}
const api = await import("../server/utils/adminApi");
vi.stubGlobal("adminApiWithToken", api.adminApiWithToken);
vi.stubGlobal("requestVerifiedToken", api.requestVerifiedToken);
vi.stubGlobal("passwordRequired", api.passwordRequired);
const { startPasskeyRegistration, finishPasskeyRegistration } = await import("../server/utils/passkeyRegistration");

const event = {} as never;
const OPTIONS = { challenge: "abc", rp: { id: "backoffice.mein-restaurant.de" } };
const credential = { id: "cred", type: "public-key" };
let user = 0;

/** Shopware: the password "richtig" gives a verified token, the plugin answers both steps. */
function shopware(call: Call) {
  if (call.url.endsWith("/api/oauth/token")) {
    if (call.options.body?.password !== "richtig")
      throw fetchError(400, { errors: [{ code: "6", title: "invalid_grant" }] });
    return { access_token: "verified", refresh_token: "verified-refresh", expires_in: 600 };
  }
  if (call.url.endsWith("/register-options")) return OPTIONS;
  if (call.url.endsWith("/register")) return { id: "p1" };
  throw new Error(`unexpected ${call.url}`);
}

beforeEach(() => {
  calls.length = 0;
  answer = shopware;
  // a fresh user name per test keeps the in-memory login limiter apart
  data = {
    username: `anna${++user}`,
    accessToken: "session",
    refreshToken: "session-refresh",
    expiresAt: now + 60_000,
  };
});

describe("startPasskeyRegistration", () => {
  it("logs in again with scope user-verified and asks the plugin with that token", async () => {
    await expect(startPasskeyRegistration(event, "richtig")).resolves.toEqual(OPTIONS);
    expect(calls[0]!.url).toBe("https://shop.test/api/oauth/token");
    expect(calls[0]!.options.body).toEqual({
      grant_type: "password",
      client_id: "administration",
      scope: "write user-verified",
      username: data.username,
      password: "richtig",
    });
    expect(calls[1]!.url).toBe("https://shop.test/api/_action/shopbite/passkey/register-options");
    expect(calls[1]!.options.headers?.Authorization).toBe("Bearer verified");
  });

  it("keeps the verified token server side for a few minutes and leaves the session tokens alone", async () => {
    await startPasskeyRegistration(event, "richtig");
    expect(data).toMatchObject({ accessToken: "session", refreshToken: "session-refresh", verifiedToken: "verified" });
    expect(data.verifiedUntil).toBe(now + 5 * 60 * 1000);
    expect(JSON.stringify(data)).not.toContain("verified-refresh");
  });

  it("answers a wrong password with 400 'Falsches Passwort', not 401 (that would log out)", async () => {
    await expect(startPasskeyRegistration(event, "falsch")).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Falsches Passwort",
    });
    expect(calls).toHaveLength(1);
    expect(data.verifiedToken).toBeUndefined();
  });

  it("counts wrong passwords in the login limiter", async () => {
    for (let i = 0; i < limit.LIMITS.user; i++) await startPasskeyRegistration(event, "falsch").catch(() => {});
    calls.length = 0;
    await expect(startPasskeyRegistration(event, "richtig")).rejects.toMatchObject({ statusCode: 429 });
    expect(calls).toEqual([]);
  });

  it("does not count an unreachable Shopware as a wrong password", async () => {
    answer = () => {
      throw fetchError(503, undefined);
    };
    await expect(startPasskeyRegistration(event, "richtig")).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("finishPasskeyRegistration", () => {
  it("registers with the verified token and drops it afterwards", async () => {
    await startPasskeyRegistration(event, "richtig");
    calls.length = 0;
    await expect(finishPasskeyRegistration(event, { name: "iPhone", credential })).resolves.toEqual({ id: "p1" });
    expect(calls[0]!.url).toBe("https://shop.test/api/_action/shopbite/passkey/register");
    expect(calls[0]!.options.headers?.Authorization).toBe("Bearer verified");
    expect(calls[0]!.options.body).toEqual({ name: "iPhone", credential });
    expect(data.verifiedToken).toBeUndefined();
    expect(data).toMatchObject({ accessToken: "session", refreshToken: "session-refresh" });
  });

  it("asks for the password again without a verified token", async () => {
    await expect(finishPasskeyRegistration(event, { name: "iPhone", credential })).rejects.toMatchObject({
      statusCode: 403,
      data: { passwordRequired: true },
    });
    expect(calls).toEqual([]);
  });

  it("asks for the password again once the verified token is too old", async () => {
    await startPasskeyRegistration(event, "richtig");
    calls.length = 0;
    now += 5 * 60 * 1000;
    await expect(finishPasskeyRegistration(event, { name: "iPhone", credential })).rejects.toMatchObject({
      data: { passwordRequired: true },
    });
    expect(calls).toEqual([]);
  });

  it("asks for the password again when Shopware refuses the scope, and does not refresh", async () => {
    await startPasskeyRegistration(event, "richtig");
    calls.length = 0;
    answer = () => {
      throw fetchError(403, { errors: [{ code: "FRAMEWORK__INVALID_SCOPE_ACCESS_TOKEN", status: "403" }] });
    };
    await expect(finishPasskeyRegistration(event, { name: "iPhone", credential })).rejects.toMatchObject({
      statusCode: 403,
      data: { passwordRequired: true },
    });
    expect(calls).toHaveLength(1);
    expect(data.verifiedToken).toBeUndefined();
  });
});

describe("adminApiWithToken", () => {
  it("does not retry with a refresh on 401", async () => {
    answer = () => {
      throw fetchError(401, { errors: [{ code: "9", status: "401" }] });
    };
    await expect(api.adminApiWithToken("expired", "/_action/shopbite/passkey/register-options")).rejects.toMatchObject({
      data: { passwordRequired: true },
    });
    expect(calls).toHaveLength(1);
    expect(data.accessToken).toBe("session");
  });

  it("maps other 403s to the usual missing privilege text", async () => {
    answer = () => {
      throw fetchError(403, { errors: [{ code: "FRAMEWORK__MISSING_PRIVILEGE_ERROR", status: "403" }] });
    };
    await expect(api.adminApiWithToken("verified", "/x")).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "Dafür fehlt dieser Anmeldung die Berechtigung",
    });
  });
});
