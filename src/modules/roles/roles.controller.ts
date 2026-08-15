import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

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

  @Get()
  @RequirePermissions(PERMISSIONS.roles.view)
  @ApiOperation({ summary: 'List all system roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.roles.view)
  @ApiOperation({ summary: 'Get role details by ID' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.roles.create)
  @ApiOperation({ summary: 'Create a custom role' })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.roles.delete)
  @ApiOperation({ summary: 'Delete a role' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
