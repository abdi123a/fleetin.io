import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PERMISSIONS } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

/**
 * Role administration.
 *
 * Reads are separated from writes: a MANAGER can list roles to assign one,
 * but editing the permission catalogue itself stays with ADMIN. Previously the
 * whole controller was gated on the ADMIN role name, which made "let managers
 * see the role list" impossible without granting them role mutation too.
 */
@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /* Declared before `:id` — Nest matches in declaration order, so the
     parameterised route would otherwise swallow `/roles/catalog`. */
  @Get('catalog')
  @RequirePermissions(PERMISSIONS.roles.view)
  @ApiOperation({ summary: 'The permission vocabulary, grouped by resource' })
  catalog() {
    return this.rolesService.catalog();
  }

  @Get()
  @RequirePermissions(PERMISSIONS.roles.view)
  @ApiOperation({ summary: 'List all system roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.roles.view)
  @ApiOperation({ summary: 'Get role details and holders by ID' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.roles.create)
  @ApiOperation({ summary: 'Create a custom access profile' })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.roles.update)
  @ApiOperation({ summary: 'Edit a custom profile’s description or grants' })
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.roles.delete)
  @ApiOperation({ summary: 'Delete a custom access profile' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
