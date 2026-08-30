import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { TaskLinkDto } from './create-task.dto';

/** Replaces the whole set — an empty array unlinks everything, deliberately. */
export class SetTaskLinksDto {
  @ApiProperty({ type: [TaskLinkDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskLinkDto)
  links: TaskLinkDto[];
}
