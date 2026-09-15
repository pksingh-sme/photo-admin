import { Controller, Get, Req } from '@nestjs/common';

@Controller()
export class ReqDecoratorFixtureController {
  @Get()
  read(@Req() request: object): string {
    return request.constructor.name;
  }
}
