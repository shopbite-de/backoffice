import { WebAuthnError } from "@simplewebauthn/browser";

/** A name for the device being set up, editable before saving ("iPhone", "Android-Tablet"). */
export function guessDeviceName(userAgent: string): string {
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? "Android-Handy" : "Android-Tablet";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows-PC";
  return "Dieses Gerät";
}

/** The browser's WebAuthn errors in plain words; cancelling is not an error worth a red box. */
export function passkeyErrorMessage(error: unknown): string | null {
  const cause = error instanceof WebAuthnError ? (error.cause as Error | undefined) : (error as Error | undefined);
  const name = cause?.name;
  if (name === "NotAllowedError" || name === "AbortError") return null;
  if (name === "InvalidStateError") return "Dieses Gerät ist schon eingerichtet.";
  if (name === "SecurityError") return "Fingerabdruck geht nur unter der eingerichteten Adresse des Backoffice.";
  return errorMessage(error);
}
