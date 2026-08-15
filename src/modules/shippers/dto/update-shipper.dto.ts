import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateShipperDto } from './create-shipper.dto';

/** Contacts are managed through their own /shippers/:id/contacts sub-routes, not here. */
export class UpdateShipperDto extends PartialType(
  OmitType(CreateShipperDto, ['primaryContact', 'operationalContacts'] as const),
) {}
