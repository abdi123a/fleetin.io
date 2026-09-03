import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmptyReturnsService } from './empty-returns.service';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { ImpactDecisionDto } from './dto/impact-decision.dto';
import { PlanEmptyReturnDto } from './dto/plan-empty-return.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { bookingOwnerScope, cycleOwnerScope } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Empty Returns')
@ApiBearerAuth()
@Controller('empty-returns')
export class EmptyReturnsController {
  constructor(private readonly emptyReturnsService: EmptyReturnsService) {}

  @Get('available-empties')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'Delivered containerized bookings with no cycle yet — the matching pool\'s "empty" side' })
  findAvailableEmpties(@CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.findAvailableEmpties(bookingOwnerScope(user));
  }

  @Get('open-full-loads')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'Open containerized bookings not yet claimed by a cycle — the matching pool\'s "full" side' })
  findOpenFullLoads(@CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.findOpenFullLoads(bookingOwnerScope(user));
  }

  @Get('bookings/:bookingId/suggestions')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({
    summary:
      'Full loads that could take this empty — the v19 engine, ranked (same line, same size, pickup inside the deadline)',
  })
  suggestionsForEmpty(@Param('bookingId') bookingId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.suggestionsForEmpty(bookingId, bookingOwnerScope(user));
  }

  @Get('loads/:bookingId/suggestions')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'Waiting empties that could ride out under this full load — the same engine, reversed' })
  suggestionsForLoad(@Param('bookingId') bookingId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.suggestionsForLoad(bookingId, bookingOwnerScope(user));
  }

  @Get('cycles')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'List empty-return cycles' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'chainId', required: false })
  findAllCycles(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('chainId') chainId?: string,
  ) {
    return this.emptyReturnsService.findAllCycles({ status, chainId, scope: cycleOwnerScope(user) });
  }

  @Get('cycles/:id')
  @RequirePermissions(PERMISSIONS.emptyReturns.view)
  @ApiOperation({ summary: 'Get a cycle by ID' })
  findCycle(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.findCycle(id, cycleOwnerScope(user));
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
  findAllChains(@CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.findAllChains(cycleOwnerScope(user));
  }

  @Delete('cycles/:id')
  @RequirePermissions(PERMISSIONS.emptyReturns.update)
  @ApiOperation({ summary: 'Cancel a pairing — the container goes back to Empty Ready and the outbound load is released' })
  cancelCycle(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.cancelCycle(id, cycleOwnerScope(user));
  }

  @Patch('cycles/:id/impact')
  @RequirePermissions(PERMISSIONS.emptyReturns.update)
  @ApiOperation({ summary: 'Say whether the pairing was physically realized — the truck continued to the port, or went back to the garage' })
  decideImpact(@Param('id') id: string, @Body() dto: ImpactDecisionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.decideImpact(id, dto, user, cycleOwnerScope(user));
  }

  @Delete('cycles/:id/impact')
  @RequirePermissions(PERMISSIONS.emptyReturns.update)
  @ApiOperation({ summary: 'Withdraw the operator’s verdict on a pairing’s impact and let the bookings’ rungs decide again' })
  clearImpactDecision(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.emptyReturnsService.clearImpactDecision(id, cycleOwnerScope(user));
  }

  @Patch('bookings/:bookingId/standalone')
  @RequirePermissions(PERMISSIONS.emptyReturns.update)
  @ApiOperation({ summary: 'Plan the empty return — matching stops and the container goes back on its own' })
  markStandalone(@Param('bookingId') bookingId: string, @Body() dto: PlanEmptyReturnDto) {
    return this.emptyReturnsService.markStandalone(bookingId, dto?.plannedReturnAt);
  }

  @Patch('bookings/:bookingId/confirm-returned')
  @RequirePermissions(PERMISSIONS.emptyReturns.create)
  @ApiOperation({ summary: 'Confirm a standalone container has physically made it back — the one closing action that vocabulary had none of' })
  confirmStandaloneReturn(@Param('bookingId') bookingId: string) {
    return this.emptyReturnsService.confirmStandaloneReturn(bookingId);
  }
}
