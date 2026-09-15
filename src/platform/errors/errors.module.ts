import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DomainExceptionFilter } from './exception.filter.js';
import { FastifyErrorHandlerHook } from './fastify-error-handler.js';
import { RequestIdHook } from './request-id.hook.js';

@Module({
  providers: [
    RequestIdHook,
    FastifyErrorHandlerHook,
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
    },
  ],
})
export class ErrorsModule {}
