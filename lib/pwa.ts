/**
 * Shared PWA utilities — the single source of truth for PWA helpers across the
 * codebase. All PWA-related helpers live here, never inline in components.
 */

/**
 * Decodes a base64url VAPID public key into the `Uint8Array` that
 * `pushManager.subscribe({ applicationServerKey })` requires.
 *
 * This is the canonical MDN Web Push implementation, used VERBATIM. Do not
 * rewrite it — incorrect base64url padding/char replacement produces
 * `DOMException: Registration failed - public key provided is invalid`.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Narrow type guard for the iOS-only, non-standard `navigator.standalone`.
 * Avoids `(navigator as any)` casts.
 */
function navigatorHasStandalone(
  n: Navigator,
): n is Navigator & { standalone: boolean } {
  return "standalone" in n;
}

/**
 * True when the app is running as an installed/standalone PWA (Home Screen on
 * iOS, installed app on Android/desktop). iOS Safari Web Push only works in
 * this mode, so the push toggle gates on it.
 */
export function isIOSStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayModeStandalone = window.matchMedia(
    "(display-mode: standalone)",
  ).matches;
  const iosStandalone =
    navigatorHasStandalone(window.navigator) && window.navigator.standalone;
  return displayModeStandalone || iosStandalone;
}

/**
 * True on iOS/iPadOS. Used to show the "Add to Home Screen first" hint, since
 * iOS Safari (not installed) exposes no PushManager — capability detection
 * alone can't tell that case apart from a genuinely unsupported browser.
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPhone|iPad|iPod/.test(ua);
  // iPadOS 13+ reports as "MacIntel"; distinguish it via touch support.
  const iPadOS =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}
