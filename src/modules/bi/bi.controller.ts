import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BiService } from './bi.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

@ApiTags('BI')
@ApiBearerAuth()
@Controller('bi')
export class BiController {
  constructor(private readonly bi: BiService) {}

  @Get('shipper/:shipperId/dataset')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({
    summary:
      "One shipper's analytics dataset, built from real bookings. Same shape the frontend's BiDataset contract already consumes.",
  })
  @ApiQuery({ name: 'asOf', required: false, description: 'Observation instant; defaults to now.' })
  shipperDataset(@Param('shipperId') shipperId: string, @Query('asOf') asOf?: string) {
    return this.bi.dataset({ shipperId, asOf });
  }

  @Get('transporter/:partnerId/dataset')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({ summary: "One transporter's analytics dataset, from the same real bookings, scoped by carrier." })
  @ApiQuery({ name: 'asOf', required: false })
  transporterDataset(@Param('partnerId') partnerId: string, @Query('asOf') asOf?: string) {
    return this.bi.dataset({ partnerId, asOf });
  }
}
