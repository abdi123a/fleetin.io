import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { CreateProformaDto } from './dto/create-proforma.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'List proformas and invoices' })
  @ApiQuery({ name: 'shipperId', required: false })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'kind', required: false, example: 'invoice', description: 'proforma | invoice | all' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @Query('shipperId') shipperId?: string,
    @Query('projectId') projectId?: string,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.invoicesService.findAll({ shipperId, projectId, kind, status, page: +page, limit: +limit });
  }

  @Get('for-shipment/:shipmentId')
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: "A shipment's proforma and invoice" })
  findForShipment(@Param('shipmentId') shipmentId: string) {
    return this.invoicesService.findForShipment(shipmentId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'Get a document by ID or number' })
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post('proforma')
  @RequirePermissions(PERMISSIONS.finance.create)
  @ApiOperation({
    summary:
      'Write a quotation for work that has not happened — client plus hand-typed lines. Deliberately not built from a shipment: there is none yet.',
  })
  createProforma(@Body() dto: CreateProformaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.createProforma(dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Post('issue-for-shipment/:shipmentId')
  @RequirePermissions(PERMISSIONS.finance.create)
  @ApiOperation({ summary: "Raise a shipment's invoice. Idempotent per shipment; refuses an unpriced shipment." })
  issueForShipment(@Param('shipmentId') shipmentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.issueForShipment(shipmentId, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Patch(':id/mark-sent')
  @RequirePermissions(PERMISSIONS.finance.update)
  @ApiOperation({ summary: 'Record that the document went to the client' })
  markSent(@Param('id') id: string) {
    return this.invoicesService.markSent(id);
  }

  @Patch(':id/mark-paid')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({ summary: "Record the shipper's payment in full. A proforma cannot be paid." })
  markPaid(@Param('id') id: string) {
    return this.invoicesService.markPaid(id);
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.finance.update)
  @ApiOperation({ summary: 'Withdraw a document raised in error. A paid invoice cannot be cancelled.' })
  cancel(@Param('id') id: string, @Body() dto: CancelInvoiceDto) {
    return this.invoicesService.cancel(id, dto.reason);
  }
}
