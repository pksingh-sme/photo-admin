const SQL_OR_DRIVER =
  /\b(SELECT|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|SQLSTATE|ER_[A-Z0-9_]+|mysql2?|drizzle-orm)\b/i;
const STACK_FRAME = /\n\s*at\s+\S+/;

/**
 * True when a string looks like a stack trace, SQL fragment, or driver
 * message and must not be copied into an HTTP body.
 */
export function isUnsafeErrorMessage(message: string): boolean {
  return STACK_FRAME.test(message) || SQL_OR_DRIVER.test(message);
}

export const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred.';

export function clientSafeMessage(message: string): string {
  if (isUnsafeErrorMessage(message)) {
    return GENERIC_INTERNAL_MESSAGE;
  }
  return message;
}
