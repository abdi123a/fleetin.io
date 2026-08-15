import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

/** Metadata-only edits — replacing the file itself is a new upload, not an update. */
export class UpdateDocumentDto {
  @ApiPropertyOptional({ example: 'Business License' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
