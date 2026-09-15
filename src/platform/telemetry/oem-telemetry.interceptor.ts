import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { context, metrics, trace, type Span } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { boundTenantContext } from '../tenant/request-tenant.js';
import { OEM_ID_ATTRIBUTE, TELEMETRY_TRACER_NAME } from './attributes.js';
import { contextWithOemId, contextWithoutIncomingOem } from './oem-context.js';

const tracer = trace.getTracer(TELEMETRY_TRACER_NAME);
const requestCounter = metrics
  .getMeter(TELEMETRY_TRACER_NAME)
  .createCounter('http.server.request.count', {
    description:
      'HTTP requests. oem.id is set when a tenant is bound from credentials.',
  });

/**
 * Binds credential-derived OEM identity onto the request's trace context.
 * Does not read OEM from headers, query, path or body. (`FR-API-003`, `FR-TEN-009`)
 */
@Injectable()
export class OemTelemetryInterceptor implements NestInterceptor {
  intercept(
    execution: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const tenant = boundTenantContext(
      execution.switchToHttp().getRequest<unknown>(),
    );
    const parent = context.active();
    const otelContext =
      tenant === undefined
        ? contextWithoutIncomingOem(parent)
        : contextWithOemId(tenant.oemId, parent);

    const existing = trace.getSpan(otelContext);
    const ownedSpan: Span | undefined =
      existing === undefined
        ? tracer.startSpan(
            spanName(execution),
            tenant === undefined
              ? undefined
              : { attributes: { [OEM_ID_ATTRIBUTE]: tenant.oemId } },
            otelContext,
          )
        : undefined;
    const active =
      ownedSpan === undefined
        ? otelContext
        : trace.setSpan(otelContext, ownedSpan);

    return new Observable((subscriber) => {
      const subscription = context.with(active, () =>
        next.handle().subscribe({
          next: (value: unknown) => subscriber.next(value),
          error: (err: unknown) => {
            recordRequest(execution, tenant?.oemId);
            ownedSpan?.end();
            subscriber.error(err);
          },
          complete: () => {
            recordRequest(execution, tenant?.oemId);
            ownedSpan?.end();
            subscriber.complete();
          },
        }),
      );
      return () => subscription.unsubscribe();
    });
  }
}

function spanName(execution: ExecutionContext): string {
  return `${execution.getClass().name}.${execution.getHandler().name}`;
}

function recordRequest(
  execution: ExecutionContext,
  oemId: string | undefined,
): void {
  const status = statusCode(execution.switchToHttp().getResponse<unknown>());
  const attributes: Record<string, string | number> = {};
  if (oemId !== undefined) {
    attributes[OEM_ID_ATTRIBUTE] = oemId;
  }
  if (status !== undefined) {
    attributes['http.response.status_code'] = status;
  }
  requestCounter.add(1, attributes);
}

function statusCode(response: unknown): number | undefined {
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }
  if (!('statusCode' in response)) {
    return undefined;
  }
  const status = response.statusCode;
  return typeof status === 'number' ? status : undefined;
}
