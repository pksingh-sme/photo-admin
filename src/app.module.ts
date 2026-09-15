import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ErrorsModule } from './platform/errors/errors.module.js';
import { TelemetryModule } from './platform/telemetry/telemetry.module.js';

@Module({
  imports: [ErrorsModule, TelemetryModule],
  controllers: [HealthController],
})
export class AppModule {}
