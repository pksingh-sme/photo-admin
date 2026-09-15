import { type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';
import { ValidationError } from '../errors/domain-error.js';

/**
 * Parse a request parameter with a Zod schema. Controllers take
 * `z.infer<typeof schema>` so FR-API-003's key scan sees every field.
 * (`FR-API-003`)
 */
export class ZodValidationPipe<S extends z.ZodType>
  implements PipeTransform<unknown, z.infer<S>>
{
  constructor(private readonly schema: S) {}

  transform(value: unknown, metadata: ArgumentMetadata): z.infer<S> {
    void metadata;
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new ValidationError(formatZodIssues(result.error));
  }
}

export function zodPipe<S extends z.ZodType>(schema: S): ZodValidationPipe<S> {
  return new ZodValidationPipe(schema);
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length === 0 ? 'value' : issue.path.join('.');
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
