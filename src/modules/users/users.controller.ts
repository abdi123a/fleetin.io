import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

/**
 * Authorization here is by permission, not by role name.
 *
 * The permission strings come from the shared catalogue rather than being
 * written inline, so renaming one is a compile error rather than a silently
 * unenforced route. `PermissionsGuard` is global, so no `@UseGuards` is
 * needed — declaring the requirement is enough.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.users.view)
  @ApiOperation({ summary: 'List all users with pagination' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'roleId', required: false })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('roleId') roleId?: string,
  ) {
    return this.usersService.findAll(+page, +limit, roleId);
  }

  /*
   * Above `:id`, or the param route swallows the literal one.
   *
   * Gated on `shipments.view`, deliberately not `users.view`. This is the
   * picker behind "who is on this shipment", and the dispatchers who assign
   * work are exactly the accounts that do *not* administer users — gating it
   * on `users.view` would have made the crew feature admin-only. It returns
   * names and roles, no contact details or status, so it is a directory of
   * colleagues rather than an account list.
   */
  @Get('team')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({
    summary: 'The Fleetin team — active internal staff, assignable to a shipment. Excludes shipper and transporter portal accounts.',
  })
  team() {
    return this.usersService.team();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.users.view)
  @ApiOperation({ summary: 'Get user details by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.users.create)
  @ApiOperation({ summary: 'Create a new user profile' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.users.update)
  @ApiOperation({ summary: 'Update user profile details' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.users.delete)
  @ApiOperation({ summary: 'Delete user profile' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
