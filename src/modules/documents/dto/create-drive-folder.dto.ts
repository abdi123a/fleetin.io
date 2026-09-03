import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDriveFolderDto {
  @ApiProperty({ example: 'Contracts' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  /** Omitted at the root of the Files section. */
  @ApiPropertyOptional({ example: 'folder-uuid' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
