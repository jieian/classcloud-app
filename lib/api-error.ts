/**
 * API error handling utilities.
 *
 * Usage:
 *   const _GET = async (request: Request) => { ... }
 *   export const GET = withErrorHandler(_GET)
 */

/**
 * Wraps a route handler in a try-catch so unhandled exceptions return a
 * consistent 500 JSON response instead of crashing the serverless function.
 *
 * Also catches `request.json()` failures (malformed / empty body) when the
 * handler calls it without its own try-catch.
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
): T {
  return (async (...args: Parameters<T>): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("[API Error]", error);
      return Response.json(
        { error: "An unexpected error occurred. Please try again." },
        { status: 500 },
      );
    }
  }) as T;
}
