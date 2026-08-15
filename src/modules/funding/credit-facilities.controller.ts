import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditFacilitiesService } from './credit-facilities.service';
import { CreateCreditFacilityDto } from './dto/create-credit-facility.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

@ApiTags('Credit Facilities')
@ApiBearerAuth()
@Controller('credit-facilities')
export class CreditFacilitiesController {
  constructor(private readonly creditFacilitiesService: CreditFacilitiesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.finance.view)
  findAll() {
    return this.creditFacilitiesService.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'Get a facility by ID or number, including its drawdowns' })
  findOne(@Param('id') id: string) {
    return this.creditFacilitiesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.finance.create)
  create(@Body() dto: CreateCreditFacilityDto) {
    return this.creditFacilitiesService.create(dto);
  }
}
