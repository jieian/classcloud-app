/**
 * Next.js server-init hook — runs once per server process before any request.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  // Node.js runtime only. The dynamic import keeps the Node-only code (which
  // touches process.emitWarning) out of the Edge bundle entirely.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
