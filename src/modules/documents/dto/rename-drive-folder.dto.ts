import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** The name is the only thing a folder has that can change. */
export class RenameDriveFolderDto {
  @ApiProperty({ example: 'Contracts 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
}
