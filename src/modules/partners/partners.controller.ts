import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { CreateDispatcherDto } from './dto/create-dispatcher.dto';
import { UpsertBankAccountDto } from './dto/upsert-bank-account.dto';
import { VehiclesService } from '../vehicles/vehicles.service';
import { CreateVehicleDto } from '../vehicles/dto/create-vehicle.dto';
import { DriversService } from '../drivers/drivers.service';
import { CreateDriverDto } from '../drivers/dto/create-driver.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { ownCompanyScope } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Partners')
@ApiBearerAuth()
@Controller('partners')
export class PartnersController {
  constructor(
    private readonly partnersService: PartnersService,
    private readonly vehiclesService: VehiclesService,
    private readonly driversService: DriversService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.partners.view)
  @ApiOperation({ summary: 'List partners' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'serviceCategory', required: false })
  @ApiQuery({ name: 'sortBy', required: false, description: 'name-asc | name-desc | fleet-desc' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('country') country?: string,
    @Query('serviceCategory') serviceCategory?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.partnersService.findAll({
      search,
      status,
      country,
      serviceCategory,
      sortBy,
      page: +page,
      limit: +limit,
      scope: ownCompanyScope(user, { partnerField: 'id' }),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.partners.view)
  @ApiOperation({ summary: 'Get partner details, including fleet, pricing grid and bank account' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.partnersService.findOne(id, ownCompanyScope(user, { partnerField: 'id' }));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.partners.create)
  @ApiOperation({ summary: 'Onboard a new transporter/partner' })
  create(@Body() dto: CreatePartnerDto) {
    return this.partnersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.partners.update)
  @ApiOperation({ summary: 'Update partner profile fields' })
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.partners.delete)
  @ApiOperation({ summary: 'Soft-delete a partner' })
  remove(@Param('id') id: string) {
    return this.partnersService.remove(id);
  }

  @Post(':id/logo')
  @RequirePermissions(PERMISSIONS.partners.update)
  @ApiOperation({ summary: "Upload the partner's brand logo" })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.partnersService.uploadLogo(id, file);
  }

  // ── Fleet — vehicles/drivers only ever come into being under a partner (DD-02) ──

  @Post(':id/vehicles')
  @RequirePermissions(PERMISSIONS.vehicles.create)
  @ApiOperation({ summary: "Add a vehicle to this partner's fleet" })
  addVehicle(@Param('id') partnerId: string, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(partnerId, dto);
  }

  @Post(':id/drivers')
  @RequirePermissions(PERMISSIONS.drivers.create)
  @ApiOperation({ summary: "Add a driver to this partner's roster" })
  addDriver(@Param('id') partnerId: string, @Body() dto: CreateDriverDto) {
    return this.driversService.create(partnerId, dto);
  }

  // ── Dispatchers (Contact, ownerType=PARTNER) ──

  @Post(':id/dispatchers')
  @RequirePermissions(PERMISSIONS.partners.update)
  @ApiOperation({ summary: 'Add a dispatcher contact' })
  addDispatcher(@Param('id') id: string, @Body() dto: CreateDispatcherDto) {
    return this.partnersService.addDispatcher(id, dto);
  }

  @Patch(':id/dispatchers/:contactId')
  @RequirePermissions(PERMISSIONS.partners.update)
  @ApiOperation({ summary: 'Update a dispatcher contact' })
  updateDispatcher(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: Partial<CreateDispatcherDto>,
  ) {
    return this.partnersService.updateDispatcher(id, contactId, dto);
  }

  @Delete(':id/dispatchers/:contactId')
  @RequirePermissions(PERMISSIONS.partners.update)
  @ApiOperation({ summary: 'Remove a dispatcher contact' })
  removeDispatcher(@Param('id') id: string, @Param('contactId') contactId: string) {
    return this.partnersService.removeDispatcher(id, contactId);
  }

  // ── Pricing grid ──





  // ── Bank account (1:1 optional) ──

  @Put(':id/bank-account')
  @RequirePermissions(PERMISSIONS.partners.update)
  @ApiOperation({ summary: "Create or replace the partner's payout bank account" })
  upsertBankAccount(@Param('id') id: string, @Body() dto: UpsertBankAccountDto) {
    return this.partnersService.upsertBankAccount(id, dto);
  }
}
