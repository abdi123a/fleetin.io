import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.projects.view)
  @ApiQuery({ name: 'shipperId', required: false })
  @ApiQuery({ name: 'status', required: false })
  findAll(@Query('shipperId') shipperId?: string, @Query('status') status?: string) {
    return this.projectsService.findAll({ shipperId, status });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.projects.view)
  @ApiOperation({ summary: 'Get a project by ID or reference, including its shipments' })
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.projects.create)
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.projects.update)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Patch(':id/close')
  @RequirePermissions(PERMISSIONS.projects.update)
  @ApiOperation({ summary: 'Close the project — issues invoices for any unbilled shipments, then marks it completed' })
  close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.close(id, user.id, `${user.firstName} ${user.lastName}`.trim());
  }
}
