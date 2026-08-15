import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DocumentTypesService } from './document-types.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

/**
 * The document-type catalog per owner type — replaces the four
 * localStorage-persisted Zustand stores (partnerDocumentType.store.ts etc.)
 * the frontend used before a backend existed. No dedicated permission keys
 * exist for catalog management; it reuses documents.upload/documents.delete
 * rather than inventing new ones.
 */
@ApiTags('Document Types')
@ApiBearerAuth()
@Controller('document-types')
export class DocumentTypesController {
  constructor(private readonly documentTypesService: DocumentTypesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.documents.view)
  @ApiOperation({ summary: 'List the document-type catalog, optionally filtered by owner type' })
  @ApiQuery({ name: 'ownerType', required: false })
  findAll(@Query('ownerType') ownerType?: string) {
    return this.documentTypesService.findAll(ownerType);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.documents.upload)
  @ApiOperation({ summary: 'Add a document type to the catalog' })
  create(@Body() dto: CreateDocumentTypeDto) {
    return this.documentTypesService.create(dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.documents.delete)
  @ApiOperation({ summary: 'Remove a document type from the catalog' })
  remove(@Param('id') id: string) {
    return this.documentTypesService.remove(id);
  }
}
