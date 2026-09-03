import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DriveFoldersService } from './drive-folders.service';
import { CreateDriveFolderDto } from './dto/create-drive-folder.dto';
import { RenameDriveFolderDto } from './dto/rename-drive-folder.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * The Files section of Fleetin Drive — folders people make for themselves.
 *
 * Only the folders live here. The files inside them go through `/documents`
 * with `ownerType=FOLDER`, so there is one upload path, one download path and
 * one download log for every file in the system. No permission keys of its
 * own: a folder is a place to put documents, and the documents permissions
 * already say who may file, see and delete them.
 */
@ApiTags('Drive')
@ApiBearerAuth()
@Controller('drive/folders')
export class DriveFoldersController {
  constructor(private readonly driveFoldersService: DriveFoldersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.documents.view)
  @ApiOperation({ summary: 'Every folder in the Files section, flat — the client builds the tree' })
  findAll() {
    return this.driveFoldersService.findAll();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.documents.upload)
  @ApiOperation({ summary: 'Create a folder, at the root or inside another' })
  create(@Body() dto: CreateDriveFolderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.driveFoldersService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.documents.upload)
  @ApiOperation({ summary: 'Rename a folder' })
  rename(@Param('id') id: string, @Body() dto: RenameDriveFolderDto) {
    return this.driveFoldersService.rename(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.documents.delete)
  @ApiOperation({ summary: 'Delete a folder, its sub-folders and every file in them' })
  remove(@Param('id') id: string) {
    return this.driveFoldersService.remove(id);
  }
}
