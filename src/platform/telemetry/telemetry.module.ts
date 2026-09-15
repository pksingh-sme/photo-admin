import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OemTelemetryInterceptor } from './oem-telemetry.interceptor.js';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: OemTelemetryInterceptor,
    },
  ],
})
export class TelemetryModule {}
