import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePartnerDto } from './create-partner.dto';

/** Dispatchers are managed through their own /partners/:id/dispatchers sub-routes, not here. */
export class UpdatePartnerDto extends PartialType(
  OmitType(CreatePartnerDto, ['primaryDispatcher', 'additionalDispatchers'] as const),
) {}
