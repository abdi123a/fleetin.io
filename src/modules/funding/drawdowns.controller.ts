import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DrawdownsService } from './drawdowns.service';
import { CreateDrawdownDto } from './dto/create-drawdown.dto';
import { RepayDrawdownDto } from './dto/repay-drawdown.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Drawdowns')
@ApiBearerAuth()
@Controller('drawdowns')
export class DrawdownsController {
  constructor(private readonly drawdownsService: DrawdownsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiQuery({ name: 'facilityId', required: false })
  @ApiQuery({ name: 'status', required: false })
  findAll(@Query('facilityId') facilityId?: string, @Query('status') status?: string) {
    return this.drawdownsService.findAll({ facilityId, status });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.finance.view)
  findOne(@Param('id') id: string) {
    return this.drawdownsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({ summary: 'Draw against a facility — headroom-checked, already-disbursed on creation' })
  create(@Body() dto: CreateDrawdownDto, @CurrentUser() user: AuthenticatedUser) {
    return this.drawdownsService.create(dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Patch(':id/repay')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({ summary: 'Record a repayment against a drawdown — closes it once fully repaid' })
  repay(@Param('id') id: string, @Body() dto: RepayDrawdownDto, @CurrentUser() user: AuthenticatedUser) {
    return this.drawdownsService.repay(id, dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }
}
