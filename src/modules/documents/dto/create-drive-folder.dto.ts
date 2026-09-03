import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /**
   * Hang the folder under a company rather than at the root of Files.
   *
   * Sent together or not at all — a folder owned by nothing in particular is
   * a Files-section folder, which is what every folder was before this.
   */
  @ApiPropertyOptional({ enum: ['PARTNER', 'SHIPPER'] })
  @IsOptional()
  @IsIn(['PARTNER', 'SHIPPER'])
  ownerType?: 'PARTNER' | 'SHIPPER';

  @ApiPropertyOptional({ example: 'partner-uuid' })
  @IsOptional()
  @IsString()
  ownerId?: string;
}
