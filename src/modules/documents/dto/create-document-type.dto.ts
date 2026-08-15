import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DOCUMENT_OWNER_TYPES, DocumentOwnerType } from '../document-owner-type';

export class CreateDocumentTypeDto {
  @ApiProperty({ enum: DOCUMENT_OWNER_TYPES })
  @IsIn(DOCUMENT_OWNER_TYPES)
  ownerType: DocumentOwnerType;

  @ApiProperty({ example: 'Business License' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
