import type { PasskeyList } from "#shared/types/backoffice";

/** The logged-in person's passkeys (devices with fingerprint or face login). */
export default defineEventHandler((event) => adminApi<PasskeyList>(event, "/_action/shopbite/passkey"));
