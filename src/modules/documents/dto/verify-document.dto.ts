import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, ValidateIf } from 'class-validator';

export class VerifyDocumentDto {
  @ApiProperty({ enum: ['Verified', 'Rejected'] })
  @IsIn(['Verified', 'Rejected'])
  status: 'Verified' | 'Rejected';

  @ApiPropertyOptional({ description: 'Required when status is "Rejected"' })
  @ValidateIf((dto: VerifyDocumentDto) => dto.status === 'Rejected')
  @IsString()
  rejectionReason?: string;
}
