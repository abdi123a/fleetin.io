import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DOCUMENT_OWNER_TYPES, DocumentOwnerType } from '../document-owner-type';

export class UploadDocumentDto {
  @ApiProperty({ enum: DOCUMENT_OWNER_TYPES })
  @IsIn(DOCUMENT_OWNER_TYPES)
  ownerType: DocumentOwnerType;

  @ApiProperty({ example: 'partner-uuid' })
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @ApiProperty({ example: 'Business License', description: 'Must match a label already in the DocumentType catalog for this ownerType' })
  @IsString()
  @IsNotEmpty()
  category: string;

  /**
   * The day the authority issued it. Optional at the API, asked for at every
   * upload surface — a paper with no issue date cannot be told apart from a
   * renewal of itself.
   */
  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  /** Who issued it — the insurer, on a vehicle's insurance certificate. */
  @ApiPropertyOptional({ example: 'GXA Assurances' })
  @IsOptional()
  @IsString()
  issuer?: string;
}
