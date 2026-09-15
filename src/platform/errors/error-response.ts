/**
 * The only error body the API returns. Never add stack, SQL, or driver
 * fields. (`FR-API-005`)
 */
export type ErrorResponse = {
  code: string;
  message: string;
  requestId: string;
};

export function toErrorResponse(
  code: string,
  message: string,
  requestId: string,
): ErrorResponse {
  return { code, message, requestId };
}
