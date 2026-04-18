/**
 * Server-side Cloudflare Turnstile token verification.
 *
 * Required env var:
 *   TURNSTILE_SECRET_KEY  — from the Cloudflare Turnstile dashboard
 */

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

/**
 * Verifies a Turnstile challenge token.
 * Returns true if the token is valid, false otherwise.
 * Errors are suppressed — a fetch failure is treated as invalid.
 */
export async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    });
    const data: TurnstileVerifyResponse = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
