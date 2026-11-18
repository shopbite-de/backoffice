/** The value .env.example used to ship; installations that copied it must not start. */
const EXAMPLE_PASSWORDS = ["change-me-to-a-random-string-of-32-chars"];

/**
 * Why a session secret (NUXT_SESSION_PASSWORD) is unfit, or null. It seals the cookie that
 * holds the Shopware tokens, so a guessable value would let anyone forge a session.
 */
export function sessionPasswordProblem(password: string): string | null {
  if (password.length < 32) return "NUXT_SESSION_PASSWORD must have at least 32 characters";
  const weak =
    EXAMPLE_PASSWORDS.includes(password) ||
    /change-?me|example|placeholder/i.test(password) ||
    new Set(password).size < 8 ||
    // one short unit repeated ("abab...", "0123456789abcdef0123456789abcdef")
    /^(.{1,16})\1+.{0,16}$/s.test(password);
  return weak ? "NUXT_SESSION_PASSWORD is a placeholder or too simple, generate one with: openssl rand -hex 32" : null;
}
