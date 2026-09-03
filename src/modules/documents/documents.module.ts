import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentTypesController } from './document-types.controller';
import { DocumentTypesService } from './document-types.service';
import { DriveFoldersController } from './drive-folders.controller';
import { DriveFoldersService } from './drive-folders.service';

@Module({
  controllers: [DocumentsController, DocumentTypesController, DriveFoldersController],
  providers: [DocumentsService, DocumentTypesService, DriveFoldersService],
  exports: [DocumentsService, DocumentTypesService, DriveFoldersService],
})
export class DocumentsModule {}
