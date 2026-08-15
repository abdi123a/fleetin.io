import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LedgerService } from './ledger.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

@ApiTags('Ledger')
@ApiBearerAuth()
@Controller('ledger-entries')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'The append-only money-movement log — read-only, every entry is a side effect of another action' })
  @ApiQuery({ name: 'counterpartyId', required: false })
  @ApiQuery({ name: 'sourceType', required: false })
  @ApiQuery({ name: 'missionId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @Query('counterpartyId') counterpartyId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('missionId') missionId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.ledgerService.findAll({ counterpartyId, sourceType, missionId, page: +page, limit: +limit });
  }
}
