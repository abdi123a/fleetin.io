import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { EmployeeDocumentCategory } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions';
import { HrAuditService } from '../hr-audit.service';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';

@ApiTags('HR — Employees')
@ApiBearerAuth()
@Controller('hr/employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly audit: HrAuditService,
  ) {}

  @Get('expiring')
  @RequirePermissions(PERMISSIONS.hr.view)
  @ApiOperation({
    summary: 'Documents, CDD contracts and trial periods lapsing soon',
    description: 'Powers the expiry dashboard. 30/60/90 days are the usual horizons.',
  })
  @ApiQuery({ name: 'withinDays', required: false, example: 30 })
  expiring(@CurrentUser() user: AuthenticatedUser, @Query('withinDays') withinDays = 30) {
    return this.employees.expiring(user, +withinDays);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.hr.view)
  @ApiOperation({ summary: 'List employees the caller is allowed to see' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'contractType', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('contractType') contractType?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.employees.findAll(user, {
      search,
      status,
      department,
      contractType,
      page: +page,
      limit: +limit,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.hr.view)
  @ApiOperation({ summary: 'One employee, with leave balance and document list' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employees.findOne(user, id);
  }

  @Get(':id/audit')
  @RequirePermissions(PERMISSIONS.hr.viewIdentity)
  @ApiOperation({ summary: 'Who has read or changed this record' })
  auditTrail(@Param('id') id: string) {
    return this.audit.trail('Employee', id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.hr.create)
  @ApiOperation({ summary: 'Create an employee' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.hr.update)
  @ApiOperation({ summary: 'Update an employee' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.hr.delete)
  @ApiOperation({
    summary: 'Archive an employee',
    description:
      'Soft delete only. The record is marked TERMINATED and hidden from the directory; ' +
      'payroll and contract history survive for labour-inspection and CNSS purposes.',
  })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employees.archive(user, id);
  }

  // ── Document vault ───────────────────────────────────────────────────────

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.hrDocuments.upload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document to an employee file' })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: EmployeeDocumentCategory,
    @Body('issueDate') issueDate?: string,
    @Body('expiryDate') expiryDate?: string,
    @Body('notes') notes?: string,
  ) {
    return this.employees.uploadDocument(user, id, file, {
      category,
      issueDate,
      expiryDate,
      notes,
    });
  }

  @Get('documents/:documentId/download')
  @RequirePermissions(PERMISSIONS.hrDocuments.download)
  @ApiOperation({
    summary: 'A signed URL for one document',
    description: 'Valid for ten minutes and issued only after the permission check.',
  })
  download(@CurrentUser() user: AuthenticatedUser, @Param('documentId') documentId: string) {
    return this.employees.documentDownloadUrl(user, documentId);
  }

  @Get('documents/:documentId/file')
  @RequirePermissions(PERMISSIONS.hrDocuments.download)
  @ApiOperation({
    summary: 'The document itself',
    description:
      'Streams the bytes behind the permission check, under the name it was ' +
      'uploaded with. Prefer this over the signed URL, which the local storage ' +
      'driver serves statically and unauthenticated.',
  })
  async documentFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName, mimeType } = await this.employees.documentFile(user, documentId);
    const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
    res
      .status(200)
      .header('Content-Type', mimeType || 'application/octet-stream')
      .header('Content-Length', String(buffer.length))
      .header(
        'Content-Disposition',
        `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      )
      .send(buffer);
  }

  @Delete('documents/:documentId')
  @RequirePermissions(PERMISSIONS.hrDocuments.delete)
  @ApiOperation({ summary: 'Archive a document' })
  deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
  ) {
    return this.employees.deleteDocument(user, documentId);
  }
}
