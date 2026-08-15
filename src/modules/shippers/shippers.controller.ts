import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ShippersService } from './shippers.service';
import { CreateShipperDto } from './dto/create-shipper.dto';
import { UpdateShipperDto } from './dto/update-shipper.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { ownCompanyScope } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Shippers')
@ApiBearerAuth()
@Controller('shippers')
export class ShippersController {
  constructor(private readonly shippersService: ShippersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.shippers.view)
  @ApiOperation({ summary: 'List shippers' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'all | Verified | Pending | Canceled' })
  @ApiQuery({ name: 'industry', required: false })
  @ApiQuery({ name: 'sortBy', required: false, description: 'name-asc | name-desc | date-desc' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('industry') industry?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.shippersService.findAll({
      search,
      status,
      industry,
      sortBy,
      page: +page,
      limit: +limit,
      scope: ownCompanyScope(user, { shipperField: 'id' }),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.shippers.view)
  @ApiOperation({ summary: 'Get shipper details, including derived shipment counts, contacts and documents' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shippersService.findOne(id, ownCompanyScope(user, { shipperField: 'id' }));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.shippers.create)
  @ApiOperation({ summary: 'Onboard a new shipper' })
  create(@Body() dto: CreateShipperDto) {
    return this.shippersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.shippers.update)
  @ApiOperation({ summary: 'Update shipper profile fields' })
  update(@Param('id') id: string, @Body() dto: UpdateShipperDto) {
    return this.shippersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.shippers.delete)
  @ApiOperation({ summary: 'Soft-delete a shipper' })
  remove(@Param('id') id: string) {
    return this.shippersService.remove(id);
  }

  @Post(':id/logo')
  @RequirePermissions(PERMISSIONS.shippers.update)
  @ApiOperation({ summary: "Upload the shipper's brand logo" })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.shippersService.uploadLogo(id, file);
  }

  @Post(':id/contacts')
  @RequirePermissions(PERMISSIONS.shippers.update)
  @ApiOperation({ summary: 'Add a contact person' })
  addContact(@Param('id') id: string, @Body() dto: CreateContactDto) {
    return this.shippersService.addContact(id, dto);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermissions(PERMISSIONS.shippers.update)
  @ApiOperation({ summary: 'Update a contact person' })
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: Partial<CreateContactDto>,
  ) {
    return this.shippersService.updateContact(id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions(PERMISSIONS.shippers.update)
  @ApiOperation({ summary: 'Remove a contact person' })
  removeContact(@Param('id') id: string, @Param('contactId') contactId: string) {
    return this.shippersService.removeContact(id, contactId);
  }
}
