import { z } from 'zod';

const inner = z.object({
  oemId: z.string(),
});

export const nestedObject = z.object({
  wrapper: z.object({
    oemId: z.string(),
  }),
});

export const nestedArray = z.array(inner);

export const nestedUnion = z.union([
  z.object({ tenantId: z.string() }),
  z.object({ name: z.string() }),
]);

export const nestedExtend = z.object({ name: z.string() }).extend({
  oemCode: z.string(),
});
