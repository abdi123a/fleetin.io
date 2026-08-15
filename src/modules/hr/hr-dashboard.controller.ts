import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HrDashboardService } from './hr-dashboard.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('HR — Dashboard')
@ApiBearerAuth()
@Controller('hr/dashboard')
export class HrDashboardController {
  constructor(private readonly dashboard: HrDashboardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.hr.view)
  @ApiOperation({
    summary: 'Headcount, payroll totals, leave and expiring documents',
    description: 'The workbook Dashboard sheet, plus the expiry watch it never had.',
  })
  @ApiQuery({ name: 'periodId', required: false, description: 'Defaults to the latest period.' })
  summary(@CurrentUser() user: AuthenticatedUser, @Query('periodId') periodId?: string) {
    return this.dashboard.summary(user, periodId);
  }
}
