/**
 * Node-runtime-only server init. Imported dynamically from instrumentation.ts so
 * this never lands in the Edge bundle.
 *
 * Silences ONLY DEP0169 — the url.parse() deprecation emitted internally by the
 * `web-push` dependency (v3.6.7, the latest; web-push-lib.js still calls
 * url.parse() on every send). The endpoints it parses are trusted HTTPS URLs
 * issued by Apple/Google/Mozilla push services, never user input, so the
 * deprecation carries no security impact for our usage. Every other warning and
 * deprecation passes through untouched.
 */
export {}; // mark as a module (side-effect-only file)

const original = process.emitWarning.bind(process) as (...args: unknown[]) => void;

process.emitWarning = ((...args: unknown[]) => {
  const opts = args[1];
  const code =
    opts && typeof opts === "object" && "code" in opts
      ? (opts as { code?: string }).code
      : typeof opts === "string" && typeof args[2] === "string"
        ? (args[2] as string)
        : undefined;
  if (code === "DEP0169") return;
  original(...args);
}) as typeof process.emitWarning;
