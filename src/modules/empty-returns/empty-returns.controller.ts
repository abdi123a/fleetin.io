import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmptyReturnsService } from './empty-returns.service';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

@ApiTags('Empty Returns')
@ApiBearerAuth()
@Controller('empty-returns')
export class EmptyReturnsController {
  constructor(private readonly emptyReturnsService: EmptyReturnsService) {}

  @Get('available-empties')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'Delivered containerized bookings with no cycle yet — the matching pool\'s "empty" side' })
  findAvailableEmpties() {
    return this.emptyReturnsService.findAvailableEmpties();
  }

  @Get('open-full-loads')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'Open containerized bookings not yet claimed by a cycle — the matching pool\'s "full" side' })
  findOpenFullLoads() {
    return this.emptyReturnsService.findOpenFullLoads();
  }

  @Get('cycles')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'List empty-return cycles' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'chainId', required: false })
  findAllCycles(@Query('status') status?: string, @Query('chainId') chainId?: string) {
    return this.emptyReturnsService.findAllCycles({ status, chainId });
  }

  @Get('cycles/:id')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'Get a cycle by ID' })
  findCycle(@Param('id') id: string) {
    return this.emptyReturnsService.findCycle(id);
  }

  @Post('cycles')
  @RequirePermissions(PERMISSIONS.emptyReturns.create)
  @ApiOperation({ summary: 'Confirm one empty↔full match — the one write action this module has' })
  createCycle(@Body() dto: CreateCycleDto) {
    return this.emptyReturnsService.createCycle(dto);
  }

  @Get('chains')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'Every chain, with completed/on-time/max-sequence resolved' })
  findAllChains() {
    return this.emptyReturnsService.findAllChains();
  }

  @Patch('bookings/:bookingId/standalone')
  @RequirePermissions(PERMISSIONS.emptyReturns.update)
  @ApiOperation({ summary: 'Stop matching for this container — it goes back on its own' })
  markStandalone(@Param('bookingId') bookingId: string) {
    return this.emptyReturnsService.markStandalone(bookingId);
  }

  @Patch('bookings/:bookingId/confirm-returned')
  @RequirePermissions(PERMISSIONS.emptyReturns.create)
  @ApiOperation({ summary: 'Confirm a standalone container has physically made it back — the one closing action that vocabulary had none of' })
  confirmStandaloneReturn(@Param('bookingId') bookingId: string) {
    return this.emptyReturnsService.confirmStandaloneReturn(bookingId);
  }
}
