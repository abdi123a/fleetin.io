import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GenerationService } from './generation.service';
import { IssueDocumentDto } from './dto/issue-document.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';

/**
 * Writes a PDF to the response with a filename a person can read.
 *
 * `inline` so a click opens the document in the browser's viewer rather than
 * dropping it in Downloads unopened — the user still gets Save from there.
 * The name is sent twice: a plain ASCII fallback for old clients, and RFC 5987
 * `filename*` for the accented French the real names carry.
 */
function sendPdf(res: Response, buffer: Buffer, fileName: string): void {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  res
    .status(200)
    .header('Content-Type', 'application/pdf')
    .header('Content-Length', String(buffer.length))
    .header(
      'Content-Disposition',
      `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    )
    .send(buffer);
}

@ApiTags('HR — Document generation')
@ApiBearerAuth()
@Controller('hr/documents')
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}

  @Get('templates')
  @RequirePermissions(PERMISSIONS.hrDocuments.view)
  @ApiOperation({
    summary: 'The document catalogue',
    description: 'Scope decides what step 2 of the generator asks for.',
  })
  templates() {
    return this.generation.templates();
  }

  @Get('preview')
  @RequirePermissions(PERMISSIONS.hrDocuments.view)
  @ApiOperation({
    summary: 'Render a document without issuing it',
    description:
      'Same renderer and same payload builder as issue; the only difference is that this ' +
      'consumes no reference number and persists nothing.',
  })
  @ApiQuery({ name: 'template', required: true })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'periodId', required: false })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'JSON object of the template’s own inputs.',
  })
  preview(
    @Query('template') template: string,
    @Query('employeeId') employeeId?: string,
    @Query('periodId') periodId?: string,
    @Query('fields') fields?: string,
  ) {
    return this.generation.preview({
      templateKey: template,
      employeeId,
      periodId,
      fields: fields ? JSON.parse(fields) : {},
    });
  }

  @Post('issue')
  @RequirePermissions(PERMISSIONS.hrDocuments.issue)
  @ApiOperation({
    summary: 'Issue a document',
    description:
      'Consumes a reference number, stores the PDF, snapshots every rendered value and ' +
      'files a copy against the employee. Reissuing creates a new record; nothing is ' +
      'ever overwritten.',
  })
  issue(@CurrentUser() user: AuthenticatedUser, @Body() dto: IssueDocumentDto) {
    return this.generation.issue(user, {
      templateKey: dto.template,
      employeeId: dto.employeeId,
      periodId: dto.periodId,
      fields: dto.fields ?? {},
    });
  }

  @Get('issued')
  @RequirePermissions(PERMISSIONS.hrDocuments.view)
  @ApiOperation({ summary: 'What has been issued, and to whom' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'periodId', required: false })
  @ApiQuery({ name: 'templateKey', required: false })
  issued(
    @Query('employeeId') employeeId?: string,
    @Query('periodId') periodId?: string,
    @Query('templateKey') templateKey?: string,
  ) {
    return this.generation.issuedHistory({ employeeId, periodId, templateKey });
  }

  @Get('issued/:issuedId/download')
  @RequirePermissions(PERMISSIONS.hrDocuments.download)
  @ApiOperation({ summary: 'A signed URL for an issued PDF' })
  download(@CurrentUser() user: AuthenticatedUser, @Param('issuedId') issuedId: string) {
    return this.generation.downloadIssued(user, issuedId);
  }

  @Get('issued/:issuedId/file')
  @RequirePermissions(PERMISSIONS.hrDocuments.download)
  @ApiOperation({
    summary: 'The issued PDF itself',
    description:
      'Streams the bytes behind the permission check, named for a human rather ' +
      'than after the storage key. Prefer this over the signed URL: the local ' +
      'storage driver serves its objects statically and unauthenticated.',
  })
  async file(
    @CurrentUser() user: AuthenticatedUser,
    @Param('issuedId') issuedId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.generation.fileIssued(user, issuedId);
    sendPdf(res, buffer, fileName);
  }

  @Get('bordereau.xlsx')
  @RequirePermissions(PERMISSIONS.hrDocuments.view)
  @ApiOperation({ summary: 'The bordereau CNSS as a spreadsheet' })
  @ApiQuery({ name: 'periodId', required: false })
  async bordereauXlsx(@Res() res: Response, @Query('periodId') periodId?: string) {
    const { buffer, fileName } = await this.generation.bordereauXlsx({
      templateKey: 'bordereau_cnss',
      periodId,
      fields: {},
    });

    res
      .status(200)
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(buffer);
  }
}
