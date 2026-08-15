import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentTypesController } from './document-types.controller';
import { DocumentTypesService } from './document-types.service';

@Module({
  controllers: [DocumentsController, DocumentTypesController],
  providers: [DocumentsService, DocumentTypesService],
  exports: [DocumentsService, DocumentTypesService],
})
export class DocumentsModule {}
