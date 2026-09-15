import { Controller, Get, Query } from '@nestjs/common';

@Controller()
export class QueryDecoratorFixtureController {
  @Get()
  list(@Query('oemId') oemId: string): string {
    return oemId;
  }
}
