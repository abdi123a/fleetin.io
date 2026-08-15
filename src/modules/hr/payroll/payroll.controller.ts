import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { PayrollConfigService } from './payroll-config.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { SetOvertimeDto } from './dto/set-overtime.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';

@ApiTags('HR — Payroll')
@ApiBearerAuth()
@Controller('hr/payroll')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly config: PayrollConfigService,
  ) {}

  @Get('config')
  @RequirePermissions(PERMISSIONS.payroll.view)
  @ApiOperation({ summary: 'Every rate set, with band counts' })
  listConfigs() {
    return this.config.list();
  }

  @Get('config/its')
  @RequirePermissions(PERMISSIONS.payroll.view)
  @ApiOperation({
    summary: 'Look up the ITS due on a taxable wage',
    description: 'Indexed range query against the band table. Throws outside the table.',
  })
  @ApiQuery({ name: 'configId', required: true })
  @ApiQuery({ name: 'taxableWages', required: true, example: 53649.56 })
  lookupIts(
    @Query('configId') configId: string,
    @Query('taxableWages') taxableWages: string,
  ) {
    return this.config
      .lookupIts(configId, Number(taxableWages))
      .then((its) => ({ configId, taxableWages: Number(taxableWages), its }));
  }

  @Get('periods')
  @RequirePermissions(PERMISSIONS.payroll.view)
  @ApiOperation({ summary: 'Every payroll period, newest first' })
  listPeriods() {
    return this.payroll.listPeriods();
  }

  @Post('periods')
  @RequirePermissions(PERMISSIONS.payroll.calculate)
  @ApiOperation({ summary: 'Open a payroll period' })
  createPeriod(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePeriodDto) {
    return this.payroll.createPeriod(user, dto.month, dto.year);
  }

  @Get('periods/:periodId')
  @RequirePermissions(PERMISSIONS.payroll.view)
  @ApiOperation({ summary: 'One period with its lines, inputs and totals' })
  getPeriod(@CurrentUser() user: AuthenticatedUser, @Param('periodId') periodId: string) {
    return this.payroll.getPeriod(user, periodId);
  }

  @Post('periods/:periodId/overtime')
  @RequirePermissions(PERMISSIONS.payroll.calculate)
  @ApiOperation({
    summary: 'Record overtime hours and any absence for one employee',
    description:
      'Keyed on (period, employee) — never on row position, which is how the source ' +
      'workbook credited one employee’s overtime to the next one down the sheet.',
  })
  setOvertime(
    @CurrentUser() user: AuthenticatedUser,
    @Param('periodId') periodId: string,
    @Body() dto: SetOvertimeDto,
  ) {
    return this.payroll.setOvertime(user, periodId, dto.employeeId, {
      overtimeHours: dto.overtimeHours,
      absenceDeduction: dto.absenceDeduction,
      note: dto.note,
    });
  }

  @Post('periods/:periodId/calculate')
  @RequirePermissions(PERMISSIONS.payroll.calculate)
  @ApiOperation({
    summary: 'Calculate the period',
    description:
      'Writes a full snapshot per employee — name, profession, every intermediate figure ' +
      'and the config version. Re-runnable until the period is approved.',
  })
  calculate(@CurrentUser() user: AuthenticatedUser, @Param('periodId') periodId: string) {
    return this.payroll.calculate(user, periodId);
  }

  @Post('periods/:periodId/approve')
  @RequirePermissions(PERMISSIONS.payroll.approve)
  @ApiOperation({
    summary: 'Approve the period',
    description: 'The period becomes immutable. Corrections go into a new adjustment period.',
  })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('periodId') periodId: string) {
    return this.payroll.approve(user, periodId);
  }

  @Post('periods/:periodId/paid')
  @RequirePermissions(PERMISSIONS.payroll.pay)
  @ApiOperation({ summary: 'Mark an approved period as paid' })
  markPaid(@CurrentUser() user: AuthenticatedUser, @Param('periodId') periodId: string) {
    return this.payroll.markPaid(user, periodId);
  }

  @Get('periods/:periodId/lines')
  @RequirePermissions(PERMISSIONS.payroll.view)
  @ApiOperation({ summary: 'The period’s payroll lines and totals' })
  lines(@Param('periodId') periodId: string) {
    return this.payroll.linesFor(periodId);
  }

  @Get('periods/:periodId/lines/:employeeId')
  @RequirePermissions(PERMISSIONS.payroll.view)
  @ApiOperation({ summary: 'One employee’s line, as filed' })
  line(@Param('periodId') periodId: string, @Param('employeeId') employeeId: string) {
    return this.payroll.lineFor(periodId, employeeId);
  }
}
