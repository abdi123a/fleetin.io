import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { IssueStatementDto } from './dto/issue-statement.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'List invoices' })
  @ApiQuery({ name: 'shipperId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @Query('shipperId') shipperId?: string,
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.invoicesService.findAll({ shipperId, status, page: +page, limit: +limit });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'Get an invoice by ID or number' })
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post('issue-for-shipment/:shipmentId')
  @RequirePermissions(PERMISSIONS.finance.create)
  @ApiOperation({ summary: 'Manually issue a shipment\'s invoice — idempotent, and a no-op (returns null) if the shipment has no client rate set yet' })
  issueForShipment(@Param('shipmentId') shipmentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.issueForShipment(shipmentId, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Post('issue-monthly-statement')
  @RequirePermissions(PERMISSIONS.finance.create)
  @ApiOperation({
    summary:
      "Issue a shipper's end-of-month statement — one invoice listing every shipment that ran in the month. " +
      'Idempotent per shipper/month/project; returns null when there is nothing left to bill.',
  })
  issueMonthlyStatement(@Body() dto: IssueStatementDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.issueMonthlyStatement(dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Patch(':id/mark-paid')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({ summary: "Mark an invoice fully paid — credits the chosen bank account and records the matching real Payment + PaymentAllocation + LedgerEntry" })
  markPaid(@Param('id') id: string, @Body() dto: MarkPaidDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.markPaid(id, dto.bankAccountId, user.id, `${user.firstName} ${user.lastName}`.trim());
  }
}
