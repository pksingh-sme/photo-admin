import { Body, Controller, Post } from '@nestjs/common';

class CreateOemDto {
  oemId: string = '';
}

@Controller()
export class ClassDtoFixtureController {
  @Post()
  create(@Body() dto: CreateOemDto): string {
    return dto.oemId;
  }
}
