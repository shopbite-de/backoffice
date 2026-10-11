import { describe, expect, it } from "vitest";
import { LIMITS, LoginLimiter, WINDOW_MS } from "../server/utils/loginLimit";

/* Brute-force guard of the password login, with a fake clock. */
function setup() {
  let now = 1_000_000;
  const limiter = new LoginLimiter(() => now);
  const keys = [
    { key: "user:theke", limit: LIMITS.user },
    { key: "ip:10.0.0.1", limit: LIMITS.ip },
  ];
  const fail = (n: number, k = keys) => {
    for (let i = 0; i < n; i++) limiter.fail(k.map((x) => x.key));
  };
  return { limiter, keys, fail, tick: (ms: number) => (now += ms) };
}

describe("LoginLimiter", () => {
  it("blocks the sixth attempt after five failures in 15 minutes", () => {
    const { limiter, keys, fail } = setup();
    fail(4);
    expect(limiter.retryAfter(keys)).toBe(0);
    fail(1);
    expect(limiter.retryAfter(keys)).toBe(WINDOW_MS / 1000);
  });

  it("lets the user try again once the oldest failure is older than the window", () => {
    const { limiter, keys, fail, tick } = setup();
    fail(1);
    tick(60_000);
    fail(4);
    tick(WINDOW_MS - 60_000);
    expect(limiter.retryAfter(keys)).toBe(0);
  });

  it("resets the counter after a successful login", () => {
    const { limiter, keys, fail } = setup();
    fail(5);
    limiter.reset(keys.map((k) => k.key));
    expect(limiter.retryAfter(keys)).toBe(0);
  });

  it("allows more failures per IP than per user (a kitchen shares one IP)", () => {
    const { limiter, fail } = setup();
    const ip = { key: "ip:10.0.0.1", limit: LIMITS.ip };
    for (const user of ["a", "b", "c"]) fail(5, [{ key: `user:${user}`, limit: LIMITS.user }, ip]);
    // 15 failures from the IP: a fourth person still gets in
    expect(limiter.retryAfter([{ key: "user:d", limit: LIMITS.user }, ip])).toBe(0);
    fail(5, [{ key: "user:d", limit: LIMITS.user }, ip]);
    expect(limiter.retryAfter([{ key: "user:e", limit: LIMITS.user }, ip])).toBeGreaterThan(0);
  });
});
