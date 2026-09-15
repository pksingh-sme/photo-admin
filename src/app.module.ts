import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ErrorsModule } from './platform/errors/errors.module.js';

@Module({
  imports: [ErrorsModule],
  controllers: [HealthController],
})
export class AppModule {}
