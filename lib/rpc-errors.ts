// Typed constants for every RAISE EXCEPTION code emitted by public RPCs.
// Use isRpcError() instead of error.message.includes() for exact, safe matching.
// If a new RPC error code is added in Postgres, add it here first.

export const RpcError = {
  ALREADY_PENDING:          "ALREADY_PENDING",
  NOT_ENROLLED:             "NOT_ENROLLED",
  NOT_FOUND_OR_NOT_PENDING: "NOT_FOUND_OR_NOT_PENDING",
  REQUEST_NOT_PENDING:      "REQUEST_NOT_PENDING",
  ENROLLMENT_NOT_FOUND:     "ENROLLMENT_NOT_FOUND",
  USER_NOT_FOUND:           "USER_NOT_FOUND",
} as const;

export type RpcErrorCode = (typeof RpcError)[keyof typeof RpcError];

export function isRpcError(
  error: { message: string },
  code: RpcErrorCode,
): boolean {
  return error.message === code;
}
