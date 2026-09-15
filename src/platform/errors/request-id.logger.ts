import { ConsoleLogger } from '@nestjs/common';
import { getRequestId } from './request-id.js';

/**
 * Nest logger that attaches the current request id (when one is in scope)
 * to every line. (`FR-API-005`)
 */
export class RequestIdLogger extends ConsoleLogger {
  protected override formatContext(context: string): string {
    const requestId = getRequestId();
    if (requestId === undefined) {
      return super.formatContext(context);
    }
    return super.formatContext(`${context} requestId=${requestId}`);
  }
}
