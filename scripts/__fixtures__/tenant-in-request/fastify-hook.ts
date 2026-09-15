import type { FastifyInstance } from 'fastify';

export function registerTenantQueryHook(app: FastifyInstance): void {
  app.addHook('preHandler', (req, reply, done) => {
    void reply;
    const query = req.query as { oemId?: string };
    void query.oemId;
    done();
  });
}
