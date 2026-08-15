import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingsDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post('shipments/:shipmentId/bookings')
  @RequirePermissions(PERMISSIONS.bookings.create)
  @ApiOperation({ summary: 'Create every booking (one per container/trip) for a shipment in one call' })
  createMany(
    @Param('shipmentId') shipmentId: string,
    @Body() dto: CreateBookingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.createMany(shipmentId, dto, `${user.firstName} ${user.lastName}`.trim());
  }

  @Get('shipments/:shipmentId/bookings')
  @RequirePermissions(PERMISSIONS.bookings.view)
  @ApiOperation({ summary: "A shipment's own bookings, in creation order" })
  findForShipment(@Param('shipmentId') shipmentId: string) {
    return this.bookingsService.findForShipment(shipmentId);
  }

  @Get('bookings')
  @RequirePermissions(PERMISSIONS.bookings.view)
  @ApiOperation({ summary: 'List bookings' })
  @ApiQuery({ name: 'shipmentId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'containerNumber', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @Query('shipmentId') shipmentId?: string,
    @Query('status') status?: string,
    @Query('containerNumber') containerNumber?: string,
    @Query('partnerId') partnerId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.bookingsService.findAll({
      shipmentId,
      status,
      containerNumber,
      partnerId,
      page: +page,
      limit: +limit,
    });
  }

  @Get('bookings/:id')
  @RequirePermissions(PERMISSIONS.bookings.view)
  @ApiOperation({ summary: 'Get a booking by ID, including its status timeline' })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Patch('bookings/:id')
  @RequirePermissions(PERMISSIONS.bookings.update)
  @ApiOperation({ summary: 'Update non-status fields (driver/vehicle/transporter assignment, return details)' })
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookingsService.update(id, dto);
  }

  @Patch('bookings/:id/status')
  @RequirePermissions(PERMISSIONS.bookings.update)
  @ApiOperation({ summary: "Move the booking to its next status — same ladder as a shipment's" })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateBookingStatusDto) {
    return this.bookingsService.updateStatus(id, dto);
  }

  @Delete('bookings/:id')
  @RequirePermissions(PERMISSIONS.bookings.delete)
  @ApiOperation({ summary: 'Soft-delete a booking' })
  remove(@Param('id') id: string) {
    return this.bookingsService.remove(id);
  }
}
