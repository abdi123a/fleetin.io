import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LeaveStatus } from '@prisma/client';
import { LeaveService } from './leave.service';
import { RequestLeaveDto } from './dto/request-leave.dto';
import { DecideLeaveDto } from './dto/decide-leave.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';

@ApiTags('HR — Leave')
@ApiBearerAuth()
@Controller('hr/leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('planning')
  @RequirePermissions(PERMISSIONS.leave.view)
  @ApiOperation({
    summary: 'The planning grid',
    description:
      'One row per employee, one column per month over a rolling 13-month window — the ' +
      '"Leav plan" sheet the team already works from.',
  })
  @ApiQuery({ name: 'anchor', required: false, description: 'Last month shown. Defaults to today.' })
  @ApiQuery({ name: 'monthsBack', required: false, example: 12 })
  planning(
    @CurrentUser() user: AuthenticatedUser,
    @Query('anchor') anchor?: string,
    @Query('monthsBack') monthsBack = 12,
  ) {
    return this.leave.planningGrid(user, anchor ? new Date(anchor) : new Date(), +monthsBack);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.leave.view)
  @ApiOperation({ summary: 'Leave records the caller is allowed to see' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: LeaveStatus })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: LeaveStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.leave.list(user, { employeeId, status, from, to });
  }

  @Get('balance/:employeeId')
  @RequirePermissions(PERMISSIONS.leave.view)
  @ApiOperation({
    summary: 'Accrued, taken and remaining leave',
    description:
      'Accrual is continuous from the joining date with no annual reset — the workbook’s ' +
      'behaviour, which is why long-serving staff carry very large balances.',
  })
  @ApiQuery({ name: 'asOf', required: false })
  balance(@Param('employeeId') employeeId: string, @Query('asOf') asOf?: string) {
    return this.leave.balance(employeeId, asOf ? new Date(asOf) : new Date());
  }

  @Post()
  @RequirePermissions(PERMISSIONS.leave.request)
  @ApiOperation({ summary: 'Request leave' })
  request(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestLeaveDto) {
    return this.leave.request(user, dto);
  }

  @Post(':leaveId/decision')
  @RequirePermissions(PERMISSIONS.leave.approve)
  @ApiOperation({ summary: 'Approve or reject a leave request' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaveId') leaveId: string,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.leave.decide(user, leaveId, dto.decision, dto.note);
  }

  @Post(':leaveId/cancel')
  @RequirePermissions(PERMISSIONS.leave.request)
  @ApiOperation({ summary: 'Cancel a leave record' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('leaveId') leaveId: string) {
    return this.leave.cancel(user, leaveId);
  }
}
