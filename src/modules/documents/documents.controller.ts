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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { contentDisposition } from '../../common/helpers/content-disposition.util';

/**
 * Shared, polymorphic document storage for Shippers/Partners/Vehicles/Drivers.
 *
 * Replaces the frontend's fabricated client-side PDF blob
 * (src/components/documentDownload.ts) with real bytes through the existing
 * StorageService — download is the same file that was uploaded, not a
 * generated stand-in.
 */
@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.documents.view)
  @ApiOperation({ summary: 'List documents, optionally scoped to one owner' })
  @ApiQuery({ name: 'ownerType', required: false })
  @ApiQuery({ name: 'ownerId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @Query('ownerType') ownerType?: string,
    @Query('ownerId') ownerId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.documentsService.findAll({ ownerType, ownerId, page: +page, limit: +limit });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.documents.view)
  @ApiOperation({ summary: 'Get document metadata by ID' })
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.documents.upload)
  @ApiOperation({ summary: 'Upload a document' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.upload(dto, file, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.documents.upload)
  @ApiOperation({ summary: 'Update document metadata (category, expiry) — not the file itself' })
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @Patch(':id/verify')
  @RequirePermissions(PERMISSIONS.documents.verify)
  @ApiOperation({ summary: 'Verify or reject a document' })
  verify(@Param('id') id: string, @Body() dto: VerifyDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.verify(id, dto, user.id);
  }

  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.documents.view)
  @ApiOperation({ summary: "Download a document's file" })
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { buffer, document } = await this.documentsService.download(id, user.id);
    res.set({
      'Content-Type': document.mimeType,
      /* Never interpolate the raw name — see `contentDisposition`. A macOS
         screenshot carries U+202F before its AM/PM and Node refuses to put it
         in a header, which answered every such upload with a 500 and left the
         viewer showing "Preview unavailable". */
      'Content-Disposition': contentDisposition(document.name),
    });
    return new StreamableFile(buffer);
  }

  @Get(':id/downloads')
  @RequirePermissions(PERMISSIONS.documents.view)
  @ApiOperation({ summary: 'Who has taken a copy of this document, newest first' })
  downloads(@Param('id') id: string) {
    return this.documentsService.downloads(id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.documents.delete)
  @ApiOperation({ summary: 'Delete a document and its stored file' })
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
